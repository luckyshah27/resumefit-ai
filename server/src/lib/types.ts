import type { SkillCategory } from './skillOntology.js';

export type SectionKey =
  | 'header'
  | 'summary'
  | 'education'
  | 'skills'
  | 'experience'
  | 'internships'
  | 'projects'
  | 'certifications'
  | 'achievements'
  | 'links'
  | 'activities'
  | 'publications'
  | 'other';

export type DetectedSection = {
  key: SectionKey;
  heading: string;
  standardHeading: boolean;
  startLine: number;
  lines: string[];
};

export type EvidenceSource = 'skills' | 'project' | 'experience' | 'internship' | 'summary' | 'certification' | 'achievement' | 'education' | 'other';

export type EvidenceStrength = 'HIGH' | 'MEDIUM' | 'LOW';

export type SkillEvidence = { text: string; source: EvidenceSource; entryTitle?: string };

export type ResumeSkill = {
  id: string;
  skill: string;
  category: SkillCategory;
  evidence: SkillEvidence[];
  evidenceStrength: EvidenceStrength;
  inferredFrom?: string;
};

/** Fresher-specific evidence recognised in the resume (informational; not separately scored). */
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

export type ResumeEntry = {
  title: string;
  organization?: string;
  dates?: string;
  durationMonths?: number | null;
  bullets: string[];
  rawLines: string[];
  technologies: string[];
  links: string[];
  isFinalYearProject?: boolean;
};

export type EducationEntry = {
  degree?: string;
  degreeLevel?: DegreeLevel;
  field?: string;
  institution?: string;
  year?: string;
  score?: string;
  raw: string;
};

export type DegreeLevel = 'SCHOOL' | 'DIPLOMA' | 'BACHELOR' | 'MASTER' | 'DOCTORATE';

export type ResumeLink = { type: 'linkedin' | 'github' | 'portfolio' | 'leetcode' | 'other'; url: string };

export type StructuredResume = {
  candidate: { name?: string; email?: string; phone?: string; location?: string; headline?: string };
  summary?: string;
  education: EducationEntry[];
  skills: ResumeSkill[];
  skillsSectionItems: string[];
  experience: ResumeEntry[];
  internships: ResumeEntry[];
  projects: ResumeEntry[];
  certifications: string[];
  achievements: string[];
  links: ResumeLink[];
  sections: Array<Pick<DetectedSection, 'key' | 'heading' | 'standardHeading'> & { lineCount: number }>;
  stats: { wordCount: number; lineCount: number; bulletCount: number; totalExperienceMonths: number; internshipMonths: number };
  studentSignals: StudentSignals;
};

export type ExtractionMeta = {
  fileType: 'pdf' | 'docx' | 'text';
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  charCount: number;
  textPerPage?: number;
  tablesDetected: number;
  imagesDetected: number;
  multiColumnSuspected: boolean;
  unusualCharRatio: number;
  warnings: string[];
};

export type Importance = 'MANDATORY' | 'PREFERRED';

export type RequirementKind = 'skill' | 'responsibility' | 'experience' | 'education';

export type JobSkillRequirement = {
  id: string;
  kind: 'skill';
  originalPhrase: string;
  originalPhrases: string[];
  canonical: string;
  canonicalName: string;
  importance: Importance;
  category: SkillCategory;
  sourceSentence: string;
  weight: number;
};

export type JobResponsibility = { id: string; text: string; keywords: string[]; skills: string[] };

export type StructuredJob = {
  role: string;
  company?: string;
  seniority: 'INTERN' | 'ENTRY' | 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD' | 'UNSPECIFIED';
  experience: { minYears: number | null; maxYears: number | null; raw?: string };
  education: { required: boolean; minLevel: DegreeLevel | null; fields: string[]; raw?: string };
  mandatorySkills: JobSkillRequirement[];
  preferredSkills: JobSkillRequirement[];
  responsibilities: JobResponsibility[];
  tools: string[];
  domainKeywords: string[];
  wordCount: number;
};

export type MatchState = 'STRONG_MATCH' | 'MATCH' | 'PARTIAL_MATCH' | 'WEAK_EVIDENCE' | 'MISSING';

export type RequirementMatch = {
  requirementId: string;
  requirement: string;
  originalPhrase: string;
  canonical: string;
  importance: Importance;
  category: SkillCategory;
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

export type CheckStatus = 'pass' | 'warn' | 'fail';

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
  /** One-sentence, evidence-based answer to "why did I get this many points here?". */
  summary?: string;
};

export type PointLoss = {
  id: string;
  label: string;
  points: number;
  category: string;
  items: Array<{ label: string; points: number; requirementId?: string }>;
};
