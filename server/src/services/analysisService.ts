import { Types } from 'mongoose';
import { evaluateJobFit, runAnalysis, textExtractionMeta, type AnalysisReport } from '../lib/scoringEngine.js';
import { changesFromDiff, compareReports } from '../lib/compare.js';
import { applyFixes, type AppliedFix } from '../lib/fixSuggestions.js';
import { checkFabrication, hasPlaceholders } from '../lib/fabricationGuard.js';
import { normalizeResumeText } from '../lib/resumeStructurer.js';
import type { ExtractionMeta } from '../lib/types.js';
import { AnalysisModel, type IAnalysis } from '../models/Analysis.js';
import { ResumeModel, ResumeVersionModel, type IResumeVersion, type VersionChange } from '../models/Resume.js';
import { HttpError } from '../middleware/errorHandler.js';
import { parseResumeFile } from './resumeParser.js';

const MIN_RESUME_CHARS = 50;

const breakdownOf = (report: AnalysisReport) => {
  const pick = (items: Array<{ id: string; label: string; weight: number; earned: number }>) => items.map(({ id, label, weight, earned }) => ({ id, label, weight, earned }));
  return { jobFit: pick(report.jobFit.components), atsReadiness: pick(report.ats.checks), resumeQuality: pick(report.quality.components) };
};

export const analysisSummary = (analysis: IAnalysis) => ({
  id: String(analysis._id),
  resumeId: String(analysis.resumeId),
  resumeVersionId: String(analysis.resumeVersionId),
  versionNumber: analysis.versionNumber,
  jobTitle: analysis.jobTitle,
  company: analysis.company,
  scores: analysis.scores,
  previousAnalysisId: analysis.previousAnalysisId ? String(analysis.previousAnalysisId) : null,
  createdAt: analysis.createdAt,
});

export const serializeAnalysis = (analysis: IAnalysis) => ({
  ...analysisSummary(analysis),
  jobDescription: analysis.jobDescription,
  practicedQuestionIds: analysis.practicedQuestionIds,
  scoringVersion: analysis.scoringVersion,
  report: analysis.report,
});

const nextVersionNumber = async (resumeId: Types.ObjectId) => {
  const updated = await ResumeModel.findByIdAndUpdate(resumeId, { $inc: { latestVersionNumber: 1 } }, { new: true });
  if (!updated) throw new HttpError(404, 'Resume not found');
  return updated.latestVersionNumber;
};

export const createVersion = async (input: {
  userId: string;
  resumeId: Types.ObjectId;
  text: string;
  source: IResumeVersion['source'];
  extraction: ExtractionMeta;
  label?: string;
  fileName?: string;
  parentVersionId?: Types.ObjectId;
  restoredFromVersion?: number;
  changes?: VersionChange[];
}) => {
  const versionNumber = await nextVersionNumber(input.resumeId);
  return ResumeVersionModel.create({
    resumeId: input.resumeId,
    userId: new Types.ObjectId(input.userId),
    versionNumber,
    label: input.label || `Version ${versionNumber}`,
    text: input.text,
    source: input.source,
    fileName: input.fileName,
    extraction: input.extraction,
    parentVersionId: input.parentVersionId,
    restoredFromVersion: input.restoredFromVersion,
    changes: input.changes ?? [],
  });
};

/** Runs the deterministic engine for a version + JD, persists the analysis and snapshots scores onto the version. */
export const analyzeVersion = async (input: { userId: string; version: IResumeVersion; jobDescription: string; previousAnalysisId?: Types.ObjectId }) => {
  const report = runAnalysis(input.jobDescription, input.version.text, input.version.extraction);
  const analysis = await AnalysisModel.create({
    userId: new Types.ObjectId(input.userId),
    resumeId: input.version.resumeId,
    resumeVersionId: input.version._id,
    versionNumber: input.version.versionNumber,
    jobDescription: input.jobDescription,
    jobTitle: report.job.role,
    company: report.job.company,
    scores: report.scores,
    report,
    practicedQuestionIds: [],
    previousAnalysisId: input.previousAnalysisId,
    scoringVersion: report.scoringVersion,
  });
  // Snapshot is written once, by the analysis that created the version; later analyses never overwrite it.
  await ResumeVersionModel.updateOne(
    { _id: input.version._id, analysisId: { $exists: false } },
    {
      scores: report.scores,
      breakdown: breakdownOf(report),
      scoringVersion: report.scoringVersion,
      job: { role: report.job.role, company: report.job.company, jobDescription: input.jobDescription },
      analysisId: analysis._id,
    },
  );
  return analysis;
};

/** Upload or paste → parse → structure → version 1 → analysis. Optionally analyse an existing resume version against a new JD. */
export const createAnalysis = async (input: {
  userId: string;
  jobDescription: string;
  resumeText?: string;
  file?: { buffer: Buffer; originalname: string; mimetype: string };
  title?: string;
  resumeVersionId?: string;
}) => {
  if (input.resumeVersionId) {
    const version = await ResumeVersionModel.findOne({ _id: input.resumeVersionId, userId: input.userId });
    if (!version) throw new HttpError(404, 'Resume version not found');
    return analyzeVersion({ userId: input.userId, version, jobDescription: input.jobDescription });
  }

  let text: string;
  let extraction: ExtractionMeta;
  let source: IResumeVersion['source'];
  if (input.file) {
    const parsed = await parseResumeFile(input.file.buffer, input.file.originalname, input.file.mimetype);
    text = parsed.text;
    extraction = parsed.meta;
    source = 'upload';
  } else if (input.resumeText && input.resumeText.trim().length >= MIN_RESUME_CHARS) {
    text = normalizeResumeText(input.resumeText);
    extraction = textExtractionMeta(text);
    source = 'paste';
  } else {
    throw new HttpError(400, 'Upload a PDF/DOCX resume or paste at least 50 characters of resume text.');
  }

  const title = input.title?.trim() || input.file?.originalname.replace(/\.(pdf|docx)$/i, '') || 'My resume';
  const resume = await ResumeModel.create({ userId: new Types.ObjectId(input.userId), title, latestVersionNumber: 0 });
  const version = await createVersion({ userId: input.userId, resumeId: resume._id, text, source, extraction, fileName: input.file?.originalname, label: 'Original' });
  return analyzeVersion({ userId: input.userId, version, jobDescription: input.jobDescription });
};

export const getOwnedAnalysis = async (userId: string, analysisId: string) => {
  if (!Types.ObjectId.isValid(analysisId)) throw new HttpError(404, 'Analysis not found');
  const analysis = await AnalysisModel.findOne({ _id: analysisId, userId });
  if (!analysis) throw new HttpError(404, 'Analysis not found');
  return analysis;
};

const derivedExtraction = (parent: IResumeVersion, text: string): ExtractionMeta => ({
  ...parent.extraction,
  charCount: text.length,
  textPerPage: parent.extraction.pageCount ? text.length / parent.extraction.pageCount : parent.extraction.textPerPage,
  warnings: [...(parent.extraction.warnings ?? []).filter((w) => !w.startsWith('Layout signals')), `Layout signals inherited from version ${parent.versionNumber} (${parent.extraction.fileType.toUpperCase()}).`],
});

export type FixRequest = { id: string; finalText?: string; confirmed?: boolean };

/** Fix My Resume → new version → re-score with the SAME engine → before/after comparison. */
export const applyFixesAndRescore = async (userId: string, analysisId: string, requests: FixRequest[], label?: string) => {
  const analysis = await getOwnedAnalysis(userId, analysisId);
  const version = await ResumeVersionModel.findById(analysis.resumeVersionId);
  if (!version) throw new HttpError(404, 'Resume version not found');
  const suggestions = analysis.report.fixes;

  const errors: Array<{ id: string; message: string; violations?: unknown }> = [];
  const accepted: AppliedFix[] = [];
  for (const request of requests) {
    const suggestion = suggestions.find((item) => item.id === request.id);
    if (!suggestion) {
      errors.push({ id: request.id, message: 'Unknown suggestion' });
      continue;
    }
    const finalText = (request.finalText ?? suggestion.suggestedText).trim();
    if (!finalText) {
      errors.push({ id: request.id, message: 'Suggested text is empty' });
      continue;
    }
    if (hasPlaceholders(finalText)) {
      errors.push({ id: request.id, message: 'Replace every [placeholder] with true information before applying.' });
      continue;
    }
    if (suggestion.requiresConfirmation && !request.confirmed) {
      errors.push({ id: request.id, message: 'This change adds a new claim. Confirm it is true before applying.' });
      continue;
    }
    const guard = checkFabrication(version.text, finalText, [analysis.report.job.role]);
    if (!guard.ok && !request.confirmed) {
      errors.push({ id: request.id, message: 'This text introduces facts that are not in your resume. Confirm they are true to apply it.', violations: guard.violations });
      continue;
    }
    accepted.push({ id: suggestion.id, type: suggestion.type, operation: suggestion.operation, currentText: suggestion.currentText, anchor: suggestion.anchor, finalText, confirmed: request.confirmed });
  }

  if (errors.length) throw new HttpError(422, 'Some fixes could not be applied', { errors });
  if (!accepted.length) throw new HttpError(400, 'Select at least one fix to apply');

  const { text, changes } = applyFixes(version.text, accepted);
  if (!changes.some((change) => change.applied)) throw new HttpError(409, 'None of the selected fixes matched the current resume text', { changes });

  const newVersion = await createVersion({
    userId,
    resumeId: version.resumeId,
    text,
    source: 'fix',
    extraction: derivedExtraction(version, text),
    parentVersionId: version._id,
    label: label || `Fixes applied (${changes.filter((c) => c.applied).length})`,
    changes,
  });
  const after = await analyzeVersion({ userId, version: newVersion, jobDescription: analysis.jobDescription, previousAnalysisId: analysis._id });
  return { analysis: after, comparison: compareReports(analysis.report, after.report, changes), changes };
};

/**
 * Manual edit: user-edited full text becomes a new version, re-scored against a JD.
 * Added lines that introduce skills, numbers or organisations not present before are new claims:
 * they are saved only when the user explicitly confirms they are true.
 */
export const createEditedVersion = async (userId: string, resumeId: string, text: string, jobDescription: string | undefined, label?: string, confirmed = false) => {
  const resume = await ResumeModel.findOne({ _id: resumeId, userId });
  if (!resume) throw new HttpError(404, 'Resume not found');
  const parent = await ResumeVersionModel.findOne({ resumeId: resume._id }).sort({ versionNumber: -1 });
  if (!parent) throw new HttpError(404, 'Resume has no versions');
  const normalized = normalizeResumeText(text);
  if (normalized.length < MIN_RESUME_CHARS) throw new HttpError(400, 'Resume text is too short');
  if (normalized === parent.text) throw new HttpError(400, 'No changes to save');
  if (hasPlaceholders(normalized)) throw new HttpError(422, 'Replace every [placeholder] with true information before saving.');
  const changes = changesFromDiff(parent.text, normalized, 'manual-edit');
  const guard = checkFabrication(parent.text, changes.map((change) => change.after).join('\n'));
  if (!guard.ok && !confirmed) {
    throw new HttpError(422, 'Your edit adds new claims. Confirm they are true to save this version.', { code: 'CONFIRMATION_REQUIRED', violations: guard.violations });
  }
  const previous = parent.analysisId ? await AnalysisModel.findById(parent.analysisId) : null;
  const jd = jobDescription ?? previous?.jobDescription;
  if (!jd) throw new HttpError(400, 'A job description is required to score this version');
  const version = await createVersion({
    userId,
    resumeId: resume._id,
    text: normalized,
    source: 'edit',
    extraction: derivedExtraction(parent, normalized),
    parentVersionId: parent._id,
    label: label || 'Manual edit',
    changes: changes.map((change) => ({ ...change, confirmedByUser: !guard.ok || undefined })),
  });
  const analysis = await analyzeVersion({ userId, version, jobDescription: jd, previousAnalysisId: previous?._id });
  return { analysis, comparison: previous ? compareReports(previous.report, analysis.report, changes) : null };
};

/** Restore = create a new version whose content is an old version's content (history is never rewritten). */
export const restoreVersion = async (userId: string, versionId: string) => {
  const source = await ResumeVersionModel.findOne({ _id: versionId, userId });
  if (!source) throw new HttpError(404, 'Resume version not found');
  const latest = await ResumeVersionModel.findOne({ resumeId: source.resumeId }).sort({ versionNumber: -1 });
  const latestAnalysis = latest?.analysisId ? await AnalysisModel.findById(latest.analysisId) : null;
  const jd = latestAnalysis?.jobDescription ?? source.job?.jobDescription;
  if (!jd) throw new HttpError(400, 'No job description available to re-score the restored version');
  const changes = latest ? changesFromDiff(latest.text, source.text, 'restore') : [];
  const version = await createVersion({
    changes,
    userId,
    resumeId: source.resumeId,
    text: source.text,
    source: 'restore',
    extraction: source.extraction,
    parentVersionId: latest?._id,
    restoredFromVersion: source.versionNumber,
    label: `Restored from version ${source.versionNumber}`,
  });
  const analysis = await analyzeVersion({ userId, version, jobDescription: jd, previousAnalysisId: latestAnalysis?._id });
  return { analysis, comparison: latestAnalysis ? compareReports(latestAnalysis.report, analysis.report, changes) : null };
};

/** Re-run the engine on the same version + JD (demonstrates determinism; useful after engine upgrades). */
export const rescoreAnalysis = async (userId: string, analysisId: string) => {
  const analysis = await getOwnedAnalysis(userId, analysisId);
  const version = await ResumeVersionModel.findById(analysis.resumeVersionId);
  if (!version) throw new HttpError(404, 'Resume version not found');
  const report = runAnalysis(analysis.jobDescription, version.text, version.extraction, analysis.practicedQuestionIds);
  return { report, comparison: compareReports(analysis.report, report), identical: JSON.stringify(report.scores) === JSON.stringify(analysis.report.scores) };
};

export const setQuestionPracticed = async (userId: string, analysisId: string, questionId: string, practiced: boolean) => {
  const analysis = await getOwnedAnalysis(userId, analysisId);
  const version = await ResumeVersionModel.findById(analysis.resumeVersionId);
  if (!version) throw new HttpError(404, 'Resume version not found');
  const ids = new Set(analysis.practicedQuestionIds);
  if (practiced) ids.add(questionId);
  else ids.delete(questionId);
  const report = runAnalysis(analysis.jobDescription, version.text, version.extraction, [...ids]);
  analysis.practicedQuestionIds = [...ids];
  analysis.report = { ...analysis.report, interview: report.interview, scores: { ...analysis.report.scores, interviewReadiness: report.interview.readiness } };
  analysis.scores = analysis.report.scores;
  analysis.markModified('report');
  await analysis.save();
  return analysis;
};

/** v1 compatibility: stateless scoring of pasted text or an uploaded file. */
export const analyzeResume = async ({
  jobDescription,
  resumeText,
  candidateData,
  fileBuffer,
  fileName,
  mimeType,
}: {
  jobDescription: string;
  resumeText?: string;
  candidateData?: Record<string, unknown>;
  fileBuffer?: Buffer;
  fileName?: string;
  mimeType?: string;
}) => {
  let text = resumeText ?? '';
  let extraction: ExtractionMeta | undefined;
  if (!resumeText && fileBuffer && fileName) {
    const parsed = await parseResumeFile(fileBuffer, fileName, mimeType);
    text = parsed.text;
    extraction = parsed.meta;
  }
  const legacy = evaluateJobFit(jobDescription, text);
  return { ...legacy, report: runAnalysis(jobDescription, text, extraction), candidateProfile: candidateData ?? {} };
};
