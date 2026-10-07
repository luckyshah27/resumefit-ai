export type CandidateProfile = {
  phone?: string;
  location?: string;
  college?: string;
  degree?: string;
  branch?: string;
  graduationYear?: number;
  cgpa?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  bio?: string;
  preferredLocations?: string[];
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  targetRole?: string;
  profile?: CandidateProfile;
};

export type MatchState = 'STRONG_MATCH' | 'MATCH' | 'PARTIAL_MATCH' | 'WEAK_EVIDENCE' | 'MISSING';
export type EvidenceStrength = 'HIGH' | 'MEDIUM' | 'LOW';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export type SkillEvidence = { text: string; source: string; entryTitle?: string };

export type ScoreComponent = {
  id: string;
  label: string;
  weight: number;
  earned: number;
  ratio: number;
  status: CheckStatus;
  rule: string;
  evidence: string[];
  applicable: boolean;
  summary?: string;
};

export type PointLoss = {
  id: string;
  label: string;
  points: number;
  category: string;
  items: Array<{ label: string; points: number; requirementId?: string }>;
};

export type RequirementMatch = {
  requirementId: string;
  requirement: string;
  originalPhrase: string;
  canonical: string;
  importance: 'MANDATORY' | 'PREFERRED';
  category: string;
  exactMatch: boolean;
  semanticMatch: { relatedSkill: string; relatedSkillName: string; similarity: number; relation: string } | null;
  evidenceStrength: EvidenceStrength | 'NONE';
  finalMatchState: MatchState;
  credit: number;
  evidence: SkillEvidence[];
  explanation: string;
};

export type ResponsibilityMatch = {
  requirementId: string;
  responsibility: string;
  coverage: number;
  matchedTerms: string[];
  bestEvidence: string | null;
  finalMatchState: MatchState;
  credit: number;
};

export type ResumeEntry = { title: string; organization?: string; dates?: string; durationMonths?: number | null; bullets: string[]; technologies: string[] };

export type StudentSignals = {
  isStudentOrFresher: boolean;
  finalYearProjects: string[];
  academicProjects: number;
  hackathons: string[];
  competitiveProgramming: string[];
  openSource: string[];
  coursework: string[];
  certifications: number;
  githubLinked: boolean;
  graduationYear?: string;
};

export type StructuredResume = {
  candidate: { name?: string; email?: string; phone?: string; location?: string; headline?: string };
  summary?: string;
  education: Array<{ degree?: string; degreeLevel?: string; field?: string; institution?: string; year?: string; score?: string; raw: string }>;
  skills: Array<{ id: string; skill: string; category: string; evidence: SkillEvidence[]; evidenceStrength: EvidenceStrength; inferredFrom?: string }>;
  experience: ResumeEntry[];
  internships: ResumeEntry[];
  projects: ResumeEntry[];
  certifications: string[];
  achievements: string[];
  links: Array<{ type: string; url: string }>;
  sections: Array<{ key: string; heading: string; standardHeading: boolean; lineCount: number }>;
  stats: { wordCount: number; lineCount: number; bulletCount: number; totalExperienceMonths: number; internshipMonths: number };
  studentSignals?: StudentSignals;
};

export type JobSkillRequirement = { id: string; originalPhrase: string; originalPhrases: string[]; canonical: string; canonicalName: string; importance: 'MANDATORY' | 'PREFERRED'; category: string; sourceSentence: string };

export type StructuredJob = {
  role: string;
  company?: string;
  seniority: string;
  experience: { minYears: number | null; maxYears: number | null; raw?: string };
  education: { required: boolean; minLevel: string | null; fields: string[]; raw?: string };
  mandatorySkills: JobSkillRequirement[];
  preferredSkills: JobSkillRequirement[];
  responsibilities: Array<{ id: string; text: string; keywords: string[]; skills: string[] }>;
  tools: string[];
  domainKeywords: string[];
};

export type ExtractionMeta = {
  fileType: 'pdf' | 'docx' | 'text';
  fileName?: string;
  pageCount?: number;
  charCount: number;
  tablesDetected: number;
  imagesDetected: number;
  multiColumnSuspected: boolean;
  warnings: string[];
};

export type DimensionScore = { id: string; label: string; score: number; weight: number; note: string };

export type EntryAnalysis = {
  title: string;
  organization?: string;
  kind: 'project' | 'internship' | 'experience';
  technologies: string[];
  relevantTechnologies: string[];
  durationMonths?: number | null;
  dimensions: DimensionScore[];
  overall: number;
  strengths: string[];
  improvements: string[];
  flags?: string[];
  isFinalYearProject?: boolean;
  roleRelevance?: 'related' | 'unrelated' | 'unknown';
};

export type FixSuggestion = {
  id: string;
  type: string;
  title: string;
  section: string;
  currentText: string | null;
  suggestedText: string;
  operation: 'replace' | 'insert_after' | 'insert_before';
  anchor: string | null;
  why: string;
  targetRequirement: string | null;
  evidenceUsed: string[];
  impact: 'high' | 'medium' | 'low';
  requiresUserInput: boolean;
  requiresConfirmation: boolean;
  userPrompt: string | null;
  guard: { ok: boolean; violations: Array<{ type: string; value: string }> };
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
};

export type InterviewQuestion = {
  id: string;
  category: 'technical' | 'project' | 'behavioral' | 'role' | 'system-design' | 'gap';
  question: string;
  why: string;
  relatedRequirement: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  tips: string[];
  priority?: Priority;
};

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type PrepTopic = { topic: string; priority: Priority; reason: string; importance: 'MANDATORY' | 'PREFERRED'; state: string };

export type InterviewPrep = { readiness: number; evidenceReadiness: number; components: ScoreComponent[]; questions: InterviewQuestion[]; focusAreas: string[]; prepPlan?: PrepTopic[] };

export type Scores = { jobFit: number; atsReadiness: number; resumeQuality: number; interviewReadiness: number };

export type AnalysisReport = {
  scoringVersion: string;
  scores: Scores;
  job: StructuredJob;
  resume: StructuredResume;
  extraction: ExtractionMeta;
  jobFit: {
    score: number;
    components: ScoreComponent[];
    requirementMatches: RequirementMatch[];
    responsibilityMatches: ResponsibilityMatch[];
    pointLosses: PointLoss[];
    summary: { matched: number; partial: number; weak: number; missing: number; mandatoryCoverage: number };
  };
  ats: { score: number; checks: ScoreComponent[]; issues: Array<{ checkId: string; severity: 'high' | 'medium' | 'low'; message: string }>; evidence: string[]; pointLosses: PointLoss[]; disclaimer: string };
  quality: { score: number; components: ScoreComponent[]; pointLosses: PointLoss[] };
  projectAnalysis: { projects: EntryAnalysis[]; internships: EntryAnalysis[]; experience: EntryAnalysis[] };
  costingPoints: { jobFit: PointLoss[]; atsReadiness: PointLoss[]; resumeQuality: PointLoss[] };
  fixes: FixSuggestion[];
  interview: InterviewPrep;
  summary: string;
};

export type AnalysisSummary = {
  id: string;
  resumeId: string;
  resumeVersionId: string;
  versionNumber: number;
  jobTitle: string;
  company?: string;
  scores: Scores;
  previousAnalysisId: string | null;
  createdAt: string;
};

export type Analysis = AnalysisSummary & { jobDescription: string; practicedQuestionIds: string[]; scoringVersion: string; report: AnalysisReport };

export type ScoreDelta = { key: keyof Scores; label: string; before: number; after: number; delta: number };
export type CategoryDelta = { group: string; id: string; label: string; before: number; after: number; delta: number; weight: number };

export type Attribution = {
  target: string;
  group: 'Requirement' | 'Job Fit' | 'ATS Readiness' | 'Resume Quality';
  delta: number | null;
  causes: Array<{ changeId: string; text: string; why: string }>;
};

export type ReportComparison = {
  scores: ScoreDelta[];
  categories: CategoryDelta[];
  changedCategories: CategoryDelta[];
  requirementChanges: Array<{ requirement: string; canonical?: string; importance: string; before: string; after: string }>;
  attribution?: Attribution[];
};

export type VersionSummary = {
  id: string;
  resumeId: string;
  versionNumber: number;
  label: string;
  source: 'upload' | 'paste' | 'fix' | 'edit' | 'restore';
  fileName?: string;
  restoredFromVersion?: number;
  parentVersionId: string | null;
  scores?: Scores;
  job: { role: string; company?: string } | null;
  analysisId: string | null;
  scoringVersion?: string | null;
  changeCount: number;
  createdAt: string;
};

export type ResumeFamily = { id: string; title: string; latestVersionNumber: number; updatedAt: string; versions: VersionSummary[] };

export type VersionDetail = VersionSummary & {
  text: string;
  changes: Array<{ id: string; type?: string; operation: string; before: string | null; after: string; applied: boolean; reason?: string; confirmedByUser?: boolean }>;
  extraction: ExtractionMeta;
};

export type VersionComparison = {
  older: VersionSummary;
  newer: VersionSummary;
  sameJobDescription: boolean;
  scoreDeltas: Array<{ key: keyof Scores; before: number | null; after: number | null; delta: number | null }>;
  categoryDeltas: Array<{ group: string; id: string; label: string; before: number; after: number; delta: number }>;
  diff: Array<{ type: 'same' | 'added' | 'removed'; text: string }>;
  comparison?: ReportComparison | null;
};

export const APPLICATION_STATUSES = ['SAVED', 'APPLIED', 'OA', 'INTERVIEW', 'SELECTED', 'REJECTED', 'WITHDRAWN'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Application = {
  id: string;
  company: string;
  role: string;
  jobDescription?: string;
  jobUrl?: string;
  location?: string;
  jobFitScore: number | null;
  analysisId: string | null;
  resumeVersionId: string | null;
  resumeVersionNumber: number | null;
  status: ApplicationStatus;
  statusHistory: Array<{ status: ApplicationStatus; at: string }>;
  appliedAt: string | null;
  deadline: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Analytics = {
  totals: {
    applications: number;
    submitted: number;
    interviews: number;
    offers: number;
    rejected: number;
    analyses: number;
    interviewRate: number | null;
    selectionRate: number | null;
    averageJobFit: number | null;
    averageResumeQuality: number | null;
    averageAtsReadiness: number | null;
    averageApplicationJobFit: number | null;
  };
  byStatus: Array<{ status: ApplicationStatus; count: number }>;
  fitBands: Array<{ band: string; applications: number; interviews: number }>;
  scoreTrend: Array<{ id: string; date: string; label: string; jobFit: number; atsReadiness: number; resumeQuality: number }>;
  recentAnalyses: Array<{ id: string; jobTitle: string; company?: string; scores: Scores; createdAt: string }>;
};

export type ClassificationMetrics = { tp: number; fp: number; fn: number; tn: number; precision: number; recall: number; f1: number; accuracy: number; support: number };

export type ExperimentResults = {
  dataset: { version: string; description: string; jobs: number; resumes: number; requirementExamples: number; positives: number; relevancePairs: number };
  classification: Array<{
    method: string;
    label: string;
    mode: 'direct' | 'fixed-threshold' | 'cross-validated';
    thresholds?: Record<string, number> | number;
    metrics: ClassificationMetrics;
    f1Ci95: { low: number; high: number };
    byImportance: { mandatory: ClassificationMetrics; preferred: ClassificationMetrics };
  }>;
  ranking: Array<{ method: string; label: string; ndcg: Record<string, number>; precisionAtK: number; mrr: number; map: number }>;
  thresholdSweep: Record<string, Array<{ threshold: number; precision: number; recall: number; f1: number }>>;
  errors: Record<string, Array<{ jobId: string; phrase: string; resumeId: string; label: boolean; predicted: boolean; score: number }>>;
  unavailable: Array<{ method: string; reason: string }>;
  notes: string[];
  embeddingModel: string;
};

export type Experiment = { _id: string; name: string; config: Record<string, unknown>; datasetVersion: string; results: ExperimentResults; durationMs: number; createdAt: string };

export type ResearchDataset = {
  version: string;
  description: string;
  labelingGuidelines: string[];
  jobs: Array<{ id: string; title: string; requirements: Array<{ id: string; phrase: string; importance: string }> }>;
  resumes: Array<{ id: string; summary: string }>;
  counts: { requirementLabels: number; positives: number; relevanceLabels: number };
  methods: Record<string, string>;
};
