import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  analysisSummary,
  analyzeResume,
  applyFixesAndRescore,
  createAnalysis,
  getOwnedAnalysis,
  rescoreAnalysis,
  serializeAnalysis,
  setQuestionPracticed,
} from '../services/analysisService.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { limiters } from '../middleware/rateLimit.js';
import { AnalysisModel } from '../models/Analysis.js';
import { changesFromDiff, compareReports } from '../lib/compare.js';
import { MAX_RESUME_BYTES } from '../services/resumeParser.js';
import { AI_MODEL, AiUnavailableError, isAiRewriteEnabled, rewriteBullets } from '../services/aiRewriter.js';
import { ResumeVersionModel } from '../models/Resume.js';
import { exportAnalysisReportPdf } from '../services/exportService.js';
import { audit } from '../services/auditService.js';

const scoreSchema = z.object({
  jobDescription: z.string().min(20).max(20000),
  resumeText: z.string().max(40000).optional(),
  candidateData: z.record(z.unknown()).optional(),
});

const createSchema = z.object({
  jobDescription: z.string().trim().min(80, 'Paste the full job description (at least 80 characters).').max(20000),
  resumeText: z.string().max(40000).optional(),
  title: z.string().max(120).optional(),
  resumeVersionId: z.string().max(40).optional(),
});

const fixSchema = z.object({
  fixes: z.array(z.object({ id: z.string().max(60), finalText: z.string().max(2000).optional(), confirmed: z.boolean().optional() })).min(1).max(40),
  label: z.string().max(80).optional(),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 10 } });
export const analysisRouter = Router();

analysisRouter.use(authMiddleware);

/** v1: stateless scoring of pasted text (kept for backwards compatibility). */
analysisRouter.post(
  '/score',
  limiters.analysis,
  asyncHandler(async (req, res) => {
    const parsed = scoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid analysis payload', errors: parsed.error.flatten() });
    }
    return res.json(await analyzeResume(parsed.data));
  }),
);

/** v1: stateless scoring of an uploaded file. */
analysisRouter.post(
  '/upload',
  limiters.analysis,
  upload.single('resume'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Resume file is required' });
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.body.payload ?? '{}');
    } catch {
      return res.status(400).json({ message: 'payload must be valid JSON' });
    }
    const parsed = scoreSchema.safeParse({ jobDescription: body.jobDescription, candidateData: body.candidateData });
    if (!parsed.success) return res.status(400).json({ message: 'Invalid analysis payload', errors: parsed.error.flatten() });
    return res.json(await analyzeResume({ ...parsed.data, fileBuffer: req.file.buffer, fileName: req.file.originalname, mimeType: req.file.mimetype }));
  }),
);

analysisRouter.use(requireDatabase);

/** v2: JD + (PDF/DOCX upload | pasted text | existing version) → persisted analysis. */
analysisRouter.post(
  '/',
  limiters.analysis,
  upload.single('resume'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid request', errors: parsed.error.flatten() });
    const analysis = await createAnalysis({
      userId: req.user!.id,
      jobDescription: parsed.data.jobDescription,
      resumeText: parsed.data.resumeText,
      title: parsed.data.title,
      resumeVersionId: parsed.data.resumeVersionId,
      file: req.file ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype } : undefined,
    });
    audit(req, 'analysis.create', { analysisId: String(analysis._id), source: req.file ? 'upload' : parsed.data.resumeVersionId ? 'version' : 'paste' });
    return res.status(201).json(serializeAnalysis(analysis));
  }),
);

analysisRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const analyses = await AnalysisModel.find({ userId: req.user!.id }).select('-report').sort({ createdAt: -1 }).limit(100);
    return res.json({ analyses: analyses.map(analysisSummary) });
  }),
);

analysisRouter.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    return res.json(serializeAnalysis(await getOwnedAnalysis(req.user!.id, req.params.id)));
  }),
);

/** Downloadable analysis report (PDF) or the raw engine output (JSON). */
analysisRouter.get(
  '/:id/report',
  limiters.export,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const format = req.query.format === 'json' ? 'json' : req.query.format === 'pdf' || req.query.format === undefined ? 'pdf' : null;
    if (!format) throw new HttpError(400, 'format must be pdf or json');
    const analysis = await getOwnedAnalysis(req.user!.id, req.params.id);
    const name = `resumefit-report-${analysis.report.job.role.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}-v${analysis.versionNumber}`;
    audit(req, 'report.export', { analysisId: String(analysis._id), format });
    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
      return res.json(serializeAnalysis(analysis));
    }
    const pdf = await exportAnalysisReportPdf(analysis.report, { versionNumber: analysis.versionNumber, createdAt: analysis.createdAt });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
    return res.send(pdf);
  }),
);

analysisRouter.get(
  '/:id/compare/:otherId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const [before, after] = await Promise.all([getOwnedAnalysis(req.user!.id, req.params.otherId), getOwnedAnalysis(req.user!.id, req.params.id)]);
    const [beforeVersion, afterVersion] = await Promise.all([ResumeVersionModel.findById(before.resumeVersionId), ResumeVersionModel.findById(after.resumeVersionId)]);
    // Prefer the recorded change log (typed fixes); otherwise derive changes from the text diff.
    const changes =
      afterVersion && beforeVersion
        ? String(afterVersion.parentVersionId) === String(beforeVersion._id) && afterVersion.changes?.length
          ? afterVersion.changes
          : changesFromDiff(beforeVersion.text, afterVersion.text, 'manual-edit')
        : [];
    return res.json({ before: analysisSummary(before), after: analysisSummary(after), comparison: compareReports(before.report, after.report, changes), changes: afterVersion?.changes ?? [] });
  }),
);

analysisRouter.post(
  '/:id/fixes',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = fixSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid fixes payload', errors: parsed.error.flatten() });
    const result = await applyFixesAndRescore(req.user!.id, req.params.id, parsed.data.fixes, parsed.data.label);
    audit(req, 'resume.fixes_applied', {
      analysisId: req.params.id,
      newAnalysisId: String(result.analysis._id),
      applied: result.changes.filter((change) => change.applied).length,
      confirmedClaims: result.changes.filter((change) => change.confirmedByUser).length,
    });
    return res.status(201).json({ analysis: serializeAnalysis(result.analysis), comparison: result.comparison, changes: result.changes });
  }),
);

analysisRouter.post(
  '/:id/rescore',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const result = await rescoreAnalysis(req.user!.id, req.params.id);
    return res.json({ scores: result.report.scores, identical: result.identical, comparison: result.comparison });
  }),
);

/** Optional AI wording alternatives for weak-wording fixes. Every rewrite passes the fabrication guard. */
analysisRouter.post(
  '/:id/ai-rewrite',
  limiters.ai,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!isAiRewriteEnabled()) return res.status(501).json({ code: 'AI_DISABLED', message: 'AI wording is not configured on this server. Deterministic suggestions are still available.' });
    const analysis = await getOwnedAnalysis(req.user!.id, req.params.id);
    const version = await ResumeVersionModel.findById(analysis.resumeVersionId);
    if (!version) throw new HttpError(404, 'Resume version not found');
    const targets = analysis.report.fixes.filter((fix) => fix.type === 'weak-verb' && fix.currentText).slice(0, 8);
    if (!targets.length) return res.json({ model: AI_MODEL, rewrites: [] });
    const strip = (line: string) => line.replace(/^\s*[•●▪◦\-–*]\s+/, '');
    try {
      const rewrites = await rewriteBullets(targets.map((fix) => strip(fix.currentText!)), version.text, analysis.report.job.role);
      audit(req, 'ai.rewrite', { analysisId: req.params.id, returned: rewrites.length, accepted: rewrites.filter((rewrite) => rewrite.accepted).length });
      return res.json({
        model: AI_MODEL,
        rewrites: rewrites.flatMap((rewrite) => {
          const fix = targets.find((item) => strip(item.currentText!) === rewrite.original);
          if (!fix) return [];
          const prefix = fix.currentText!.match(/^\s*[•●▪◦\-–*]\s+/)?.[0] ?? '';
          return [{ fixId: fix.id, original: fix.currentText, text: `${prefix}${rewrite.text}`, accepted: rewrite.accepted, violations: rewrite.guard.violations }];
        }),
      });
    } catch (error) {
      if (error instanceof AiUnavailableError) return res.status(502).json({ code: 'AI_UNAVAILABLE', message: error.message });
      throw error;
    }
  }),
);

analysisRouter.patch(
  '/:id/practice',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = z.object({ questionId: z.string().max(20), practiced: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'questionId and practiced are required');
    const analysis = await setQuestionPracticed(req.user!.id, req.params.id, parsed.data.questionId, parsed.data.practiced);
    return res.json({ practicedQuestionIds: analysis.practicedQuestionIds, interview: analysis.report.interview, scores: analysis.scores });
  }),
);

analysisRouter.delete(
  '/:id',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const analysis = await getOwnedAnalysis(req.user!.id, req.params.id);
    await analysis.deleteOne();
    audit(req, 'analysis.delete', { analysisId: req.params.id });
    return res.status(204).end();
  }),
);
