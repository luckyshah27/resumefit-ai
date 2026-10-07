import { extractJob } from './jdExtractor.js';
import { structureResume, normalizeResumeText } from './resumeStructurer.js';
import { MATCHING_VERSION, scoreJobFit, type JobFitResult } from './matchingEngine.js';
import { scoreAtsReadiness, type AtsResult } from './atsReadiness.js';
import { scoreResumeQuality, type QualityResult } from './resumeQuality.js';
import { analyzeInternship, analyzeProject, type EntryAnalysis } from './projectAnalysis.js';
import { generateFixSuggestions, type FixSuggestion } from './fixSuggestions.js';
import { buildInterviewPrep, type InterviewPrep } from './interviewPrep.js';
import type { ExtractionMeta, PointLoss, StructuredJob, StructuredResume } from './types.js';

export const SCORING_VERSION = MATCHING_VERSION;

/** Every change that can move a score must add an entry here and bump SCORING_VERSION. */
export const SCORING_CHANGELOG = [
  { version: '1.0.0', change: 'Initial keyword-based engine (hard-coded requirement list).' },
  { version: '2.0.0', change: 'Structured resume/JD extraction, evidence-graded five-state matching, separate ATS Readiness and Resume Quality, point-loss attribution.' },
  { version: '2.1.0', change: 'ATS extractability also deducts for malformed extraction (run-together words, letter-spaced text). No other weights changed.' },
] as const;

/** Legacy category shape kept for backwards compatibility with v1 consumers. */
export type ScoreCategory = {
  category: string;
  weight: number;
  earnedPoints: number;
  evidence: string[];
  matchedRequirements: string[];
  missingRequirements: string[];
  scoringRule: string;
};

export type AnalysisReport = {
  scoringVersion: string;
  scores: { jobFit: number; atsReadiness: number; resumeQuality: number; interviewReadiness: number };
  job: StructuredJob;
  resume: StructuredResume;
  extraction: ExtractionMeta;
  jobFit: JobFitResult;
  ats: AtsResult;
  quality: QualityResult;
  projectAnalysis: { projects: EntryAnalysis[]; internships: EntryAnalysis[]; experience: EntryAnalysis[] };
  costingPoints: { jobFit: PointLoss[]; atsReadiness: PointLoss[]; resumeQuality: PointLoss[] };
  fixes: FixSuggestion[];
  interview: InterviewPrep;
  summary: string;
};

export const textExtractionMeta = (text: string): ExtractionMeta => ({
  fileType: 'text',
  charCount: text.length,
  tablesDetected: 0,
  imagesDetected: 0,
  multiColumnSuspected: false,
  unusualCharRatio: 0,
  warnings: [],
});

const summarize = (jobFit: JobFitResult, job: StructuredJob) => {
  const missing = jobFit.requirementMatches.filter((m) => m.importance === 'MANDATORY' && m.finalMatchState === 'MISSING').map((m) => m.requirement);
  const weak = jobFit.requirementMatches.filter((m) => m.finalMatchState === 'WEAK_EVIDENCE').map((m) => m.requirement);
  const band = jobFit.score >= 80 ? 'Strong fit' : jobFit.score >= 65 ? 'Good fit with gaps' : jobFit.score >= 50 ? 'Partial fit' : 'Low fit';
  const parts = [`${band} for ${job.role}${job.company ? ` at ${job.company}` : ''}.`];
  parts.push(`${jobFit.summary.matched} requirement(s) matched, ${jobFit.summary.weak} with weak evidence, ${jobFit.summary.missing} missing.`);
  if (missing.length) parts.push(`Missing mandatory: ${missing.slice(0, 4).join(', ')}.`);
  if (weak.length) parts.push(`Only listed, not demonstrated: ${weak.slice(0, 4).join(', ')}.`);
  return parts.join(' ');
};

/**
 * The single deterministic entry point used for first analysis AND every re-score.
 * Same inputs always produce the same output; no randomness, no clock-dependent logic except "Present" dates.
 */
export const runAnalysis = (jobDescription: string, resumeText: string, extraction?: ExtractionMeta, practicedQuestionIds: string[] = []): AnalysisReport => {
  const text = normalizeResumeText(resumeText);
  const meta = extraction ?? textExtractionMeta(text);
  const job = extractJob(jobDescription);
  const resume = structureResume(text);
  const jobFit = scoreJobFit(job, resume);

  const projectAnalysis = {
    projects: resume.projects.map((entry) => analyzeProject(entry, job)),
    internships: resume.internships.map((entry) => analyzeInternship(entry, job, 'internship')),
    experience: resume.experience.map((entry) => analyzeInternship(entry, job, 'experience')),
  };
  const ats = scoreAtsReadiness(resume, text, meta, job);
  const quality = scoreResumeQuality(resume, text, { projects: projectAnalysis.projects, internships: [...projectAnalysis.internships, ...projectAnalysis.experience] }, job);
  const fixes = generateFixSuggestions(text, resume, job, jobFit, ats);
  const interview = buildInterviewPrep(job, resume, jobFit, { projects: projectAnalysis.projects, internships: [...projectAnalysis.internships, ...projectAnalysis.experience] }, practicedQuestionIds);

  return {
    scoringVersion: SCORING_VERSION,
    scores: { jobFit: jobFit.score, atsReadiness: ats.score, resumeQuality: quality.score, interviewReadiness: interview.readiness },
    job,
    resume,
    extraction: meta,
    jobFit,
    ats,
    quality,
    projectAnalysis,
    costingPoints: { jobFit: jobFit.pointLosses, atsReadiness: ats.pointLosses, resumeQuality: quality.pointLosses },
    fixes,
    interview,
    summary: summarize(jobFit, job),
  };
};

export type JobAnalysisResult = {
  jobFitScore: number;
  resumeQualityScore: number;
  atsReadinessScore: number;
  requirementMatchScore: number;
  placementReadinessScore: number;
  overallScore: number;
  scoringVersion: string;
  categories: ScoreCategory[];
  matchedRequirements: string[];
  missingRequirements: string[];
  evidence: string[];
  summary: string;
};

/** v1-compatible wrapper around the v2 pipeline. */
export const evaluateJobFit = (jobDescription: string, resumeText: string): JobAnalysisResult => {
  const report = runAnalysis(jobDescription || 'Software Engineer', resumeText || '');
  const matches = report.jobFit.requirementMatches;
  const matched = matches.filter((m) => m.exactMatch).map((m) => m.requirement);
  const missing = matches.filter((m) => !m.exactMatch).map((m) => m.requirement);
  const categories: ScoreCategory[] = report.jobFit.components.map((component) => ({
    category: component.label,
    weight: component.weight,
    earnedPoints: component.earned,
    evidence: component.evidence,
    matchedRequirements: component.id === 'mandatory' || component.id === 'preferred'
      ? matches.filter((m) => m.exactMatch && m.importance === (component.id === 'mandatory' ? 'MANDATORY' : 'PREFERRED')).map((m) => m.requirement)
      : [],
    missingRequirements: component.id === 'mandatory' || component.id === 'preferred'
      ? matches.filter((m) => !m.exactMatch && m.importance === (component.id === 'mandatory' ? 'MANDATORY' : 'PREFERRED')).map((m) => m.requirement)
      : [],
    scoringRule: component.rule,
  }));
  const overall = Math.round(((report.scores.jobFit * 0.6 + report.scores.resumeQuality * 0.2 + report.scores.atsReadiness * 0.2) * 10)) / 10;
  return {
    jobFitScore: report.scores.jobFit,
    resumeQualityScore: report.scores.resumeQuality,
    atsReadinessScore: report.scores.atsReadiness,
    requirementMatchScore: report.jobFit.summary.mandatoryCoverage,
    placementReadinessScore: report.scores.interviewReadiness,
    overallScore: overall,
    scoringVersion: report.scoringVersion,
    categories,
    matchedRequirements: matched,
    missingRequirements: missing,
    evidence: report.jobFit.components.flatMap((component) => component.evidence.slice(0, 1)),
    summary: report.summary,
  };
};

export const scoreResumeAgainstJob = (jobDescription: string, resumeText: string) => evaluateJobFit(jobDescription, resumeText);
