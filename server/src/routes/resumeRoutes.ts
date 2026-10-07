import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { ResumeModel, ResumeVersionModel, type IResumeVersion } from '../models/Resume.js';
import { AnalysisModel } from '../models/Analysis.js';
import { createEditedVersion, restoreVersion, serializeAnalysis } from '../services/analysisService.js';
import { changesFromDiff, compareReports, diffLines } from '../lib/compare.js';
import { round1 } from '../utils/text.js';
import { exportResumeDocx, exportResumePdf } from '../services/exportService.js';
import { audit } from '../services/auditService.js';
import { limiters } from '../middleware/rateLimit.js';

export const resumeRouter = Router();
resumeRouter.use(authMiddleware, requireDatabase);

const versionSummary = (version: IResumeVersion) => ({
  id: String(version._id),
  resumeId: String(version.resumeId),
  versionNumber: version.versionNumber,
  label: version.label,
  source: version.source,
  fileName: version.fileName,
  restoredFromVersion: version.restoredFromVersion,
  parentVersionId: version.parentVersionId ? String(version.parentVersionId) : null,
  scores: version.scores,
  job: version.job ? { role: version.job.role, company: version.job.company } : null,
  analysisId: version.analysisId ? String(version.analysisId) : null,
  scoringVersion: version.scoringVersion ?? null,
  changeCount: version.changes?.filter((change) => change.applied).length ?? 0,
  createdAt: version.createdAt,
});

const ownedVersion = async (userId: string, versionId: string) => {
  if (!Types.ObjectId.isValid(versionId)) throw new HttpError(404, 'Version not found');
  const version = await ResumeVersionModel.findOne({ _id: versionId, userId });
  if (!version) throw new HttpError(404, 'Version not found');
  return version;
};

resumeRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const resumes = await ResumeModel.find({ userId: req.user!.id }).sort({ updatedAt: -1 });
    const versions = await ResumeVersionModel.find({ userId: req.user!.id }).select('-text -extraction -changes -breakdown').sort({ versionNumber: 1 });
    return res.json({
      resumes: resumes.map((resume) => ({
        id: String(resume._id),
        title: resume.title,
        latestVersionNumber: resume.latestVersionNumber,
        updatedAt: resume.updatedAt,
        versions: versions.filter((version) => String(version.resumeId) === String(resume._id)).map(versionSummary),
      })),
    });
  }),
);

resumeRouter.get(
  '/versions/:versionId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const version = await ownedVersion(req.user!.id, req.params.versionId);
    return res.json({ ...versionSummary(version), text: version.text, changes: version.changes, breakdown: version.breakdown, extraction: version.extraction });
  }),
);

const safeFileName = (value: string) => value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'resume';

/** Download the exact content of a version as DOCX or PDF. */
resumeRouter.get(
  '/versions/:versionId/export',
  limiters.export,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const format = req.query.format === 'pdf' ? 'pdf' : req.query.format === 'docx' || req.query.format === undefined ? 'docx' : null;
    if (!format) throw new HttpError(400, 'format must be docx or pdf');
    const version = await ownedVersion(req.user!.id, req.params.versionId);
    const resume = await ResumeModel.findById(version.resumeId);
    const buffer = format === 'pdf' ? await exportResumePdf(version.text) : await exportResumeDocx(version.text);
    const name = `${safeFileName(resume?.title ?? 'resume')}-v${version.versionNumber}.${format}`;
    audit(req, 'resume.export', { versionId: String(version._id), format });
    res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    return res.send(buffer);
  }),
);

resumeRouter.get(
  '/:resumeId/versions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const resume = await ResumeModel.findOne({ _id: req.params.resumeId, userId: req.user!.id });
    if (!resume) throw new HttpError(404, 'Resume not found');
    const versions = await ResumeVersionModel.find({ resumeId: resume._id }).select('-text -extraction').sort({ versionNumber: -1 });
    return res.json({ resume: { id: String(resume._id), title: resume.title }, versions: versions.map(versionSummary) });
  }),
);

resumeRouter.post(
  '/:resumeId/versions',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({ text: z.string().min(50).max(40000), jobDescription: z.string().min(80).max(20000).optional(), label: z.string().max(80).optional(), confirmed: z.boolean().optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid version payload', errors: parsed.error.flatten() });
    const result = await createEditedVersion(req.user!.id, req.params.resumeId, parsed.data.text, parsed.data.jobDescription, parsed.data.label, parsed.data.confirmed ?? false);
    audit(req, 'resume.version_edit', { resumeId: req.params.resumeId, analysisId: String(result.analysis._id), confirmed: parsed.data.confirmed ?? false });
    return res.status(201).json({ analysis: serializeAnalysis(result.analysis), comparison: result.comparison });
  }),
);

resumeRouter.post(
  '/versions/:versionId/restore',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await ownedVersion(req.user!.id, req.params.versionId);
    const result = await restoreVersion(req.user!.id, req.params.versionId);
    audit(req, 'resume.version_restore', { versionId: req.params.versionId, analysisId: String(result.analysis._id) });
    return res.status(201).json({ analysis: serializeAnalysis(result.analysis), comparison: result.comparison });
  }),
);

/** Compare two versions: line diff + score deltas (from the stored engine snapshots). */
resumeRouter.get(
  '/compare/:a/:b',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const [a, b] = await Promise.all([ownedVersion(req.user!.id, req.params.a), ownedVersion(req.user!.id, req.params.b)]);
    const [older, newer] = a.versionNumber <= b.versionNumber ? [a, b] : [b, a];
    const keys = ['jobFit', 'atsReadiness', 'resumeQuality', 'interviewReadiness'] as const;
    const scoreDeltas = keys.map((key) => ({ key, before: older.scores?.[key] ?? null, after: newer.scores?.[key] ?? null, delta: older.scores && newer.scores ? round1(newer.scores[key] - older.scores[key]) : null }));
    const groups = ['jobFit', 'atsReadiness', 'resumeQuality'] as const;
    const categoryDeltas = groups.flatMap((group) =>
      (newer.breakdown?.[group] ?? []).map((item) => {
        const previous = older.breakdown?.[group]?.find((other) => other.id === item.id);
        return { group, id: item.id, label: item.label, before: previous?.earned ?? 0, after: item.earned, delta: round1(item.earned - (previous?.earned ?? 0)) };
      }),
    );
    const sameJob = older.job?.jobDescription && older.job.jobDescription === newer.job?.jobDescription;
    // Full engine comparison (with change attribution) from the analyses that created each version.
    const [olderAnalysis, newerAnalysis] = await Promise.all([
      older.analysisId ? AnalysisModel.findById(older.analysisId) : null,
      newer.analysisId ? AnalysisModel.findById(newer.analysisId) : null,
    ]);
    const changes = String(newer.parentVersionId) === String(older._id) && newer.changes?.length ? newer.changes : changesFromDiff(older.text, newer.text, 'manual-edit');
    const comparison = olderAnalysis && newerAnalysis ? compareReports(olderAnalysis.report, newerAnalysis.report, changes) : null;
    return res.json({
      comparison,
      changes: newer.changes ?? [],
      older: versionSummary(older),
      newer: versionSummary(newer),
      sameJobDescription: Boolean(sameJob),
      scoreDeltas,
      categoryDeltas: categoryDeltas.filter((item) => Math.abs(item.delta) >= 0.1),
      diff: diffLines(older.text, newer.text),
    });
  }),
);

resumeRouter.get(
  '/versions/:versionId/analyses',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const version = await ownedVersion(req.user!.id, req.params.versionId);
    const analyses = await AnalysisModel.find({ resumeVersionId: version._id }).select('-report').sort({ createdAt: -1 });
    return res.json({ analyses: analyses.map((analysis) => ({ id: String(analysis._id), jobTitle: analysis.jobTitle, company: analysis.company, scores: analysis.scores, createdAt: analysis.createdAt })) });
  }),
);
