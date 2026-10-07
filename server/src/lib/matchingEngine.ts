import { expandImplied, isSpecificTechnology, relatedSkills, skillName } from './skillOntology.js';
import { degreeLevelRank, resumeSkillMap } from './resumeStructurer.js';
import type {
  JobSkillRequirement,
  MatchState,
  PointLoss,
  RequirementMatch,
  ResponsibilityMatch,
  ResumeSkill,
  ScoreComponent,
  StructuredJob,
  StructuredResume,
} from './types.js';
import { STRONG_ACTION_VERBS, contentStems, round1, stem, unique } from '../utils/text.js';

export const MATCHING_VERSION = '2.1.0';

/** Credit awarded per match state. Documented and shared by the UI legend. */
export const STATE_CREDIT: Record<MatchState, number> = {
  STRONG_MATCH: 1,
  MATCH: 0.8,
  WEAK_EVIDENCE: 0.4,
  PARTIAL_MATCH: 0.5, // upper bound; actual partial credit = similarity * cap (see below)
  MISSING: 0,
};

/** A transferable skill can never earn more than this fraction of a mandatory specific technology. */
export const MANDATORY_TECH_PARTIAL_CAP = 0.5;
export const OTHER_PARTIAL_CAP = 0.8;

const strengthState = (strength: ResumeSkill['evidenceStrength']): MatchState =>
  strength === 'HIGH' ? 'STRONG_MATCH' : strength === 'MEDIUM' ? 'MATCH' : 'WEAK_EVIDENCE';

export const matchSkillRequirement = (requirement: JobSkillRequirement, skills: Map<string, ResumeSkill>): RequirementMatch => {
  const base = {
    requirementId: requirement.id,
    requirement: requirement.canonicalName,
    originalPhrase: requirement.originalPhrase,
    canonical: requirement.canonical,
    importance: requirement.importance,
    category: requirement.category,
  };
  const found = skills.get(requirement.canonical);

  if (found) {
    const state = strengthState(found.evidenceStrength);
    const sources = unique(found.evidence.map((item) => item.source)).join(', ');
    return {
      ...base,
      exactMatch: true,
      semanticMatch: null,
      evidenceStrength: found.evidenceStrength,
      finalMatchState: state,
      credit: STATE_CREDIT[state],
      evidence: found.evidence.slice(0, 4),
      explanation:
        state === 'WEAK_EVIDENCE'
          ? `${requirement.canonicalName} is listed (${sources}) but not demonstrated in any project, internship or experience.`
          : found.inferredFrom
            ? `${requirement.canonicalName} is implied by your use of ${skillName(found.inferredFrom)} (${found.evidenceStrength.toLowerCase()} evidence).`
            : `${requirement.canonicalName} found with ${found.evidenceStrength.toLowerCase()} evidence in: ${sources}.`,
    };
  }

  // Semantic (transferable) match: bounded partial credit only, never "present".
  const candidates = relatedSkills(requirement.canonical)
    .map((related) => ({ ...related, skill: skills.get(related.skillId) }))
    .filter((related) => related.skill && related.skill.evidenceStrength !== 'LOW')
    .sort((a, b) => b.similarity - a.similarity);
  const best = candidates[0];

  if (best?.skill) {
    const cap = requirement.importance === 'MANDATORY' && isSpecificTechnology(requirement.canonical) ? MANDATORY_TECH_PARTIAL_CAP : OTHER_PARTIAL_CAP;
    const credit = round1(best.similarity * cap * 100) / 100;
    return {
      ...base,
      exactMatch: false,
      semanticMatch: { relatedSkill: best.skillId, relatedSkillName: best.skill.skill, similarity: best.similarity, relation: best.label },
      evidenceStrength: 'NONE',
      finalMatchState: 'PARTIAL_MATCH',
      credit,
      evidence: best.skill.evidence.slice(0, 2),
      explanation: `${requirement.canonicalName} was not found. ${best.skill.skill} is a related skill (${best.label}), so only partial transferable credit is given. It is still a gap.`,
    };
  }

  return {
    ...base,
    exactMatch: false,
    semanticMatch: null,
    evidenceStrength: 'NONE',
    finalMatchState: 'MISSING',
    credit: 0,
    evidence: [],
    explanation: `${requirement.canonicalName} (“${requirement.originalPhrase}”) was not found anywhere in the resume.`,
  };
};

const GENERIC_STEMS = new Set(
  [...STRONG_ACTION_VERBS, 'build', 'develop', 'design', 'write', 'work', 'use', 'ensure', 'participate', 'create', 'maintain', 'support', 'implement', 'application', 'applications', 'feature', 'features', 'code', 'system', 'systems', 'product', 'help', 'make', 'across', 'environment', 'high', 'quality'].map(stem),
);

export const matchResponsibilities = (job: StructuredJob, resume: StructuredResume): ResponsibilityMatch[] => {
  const units = [
    ...[...resume.experience, ...resume.internships, ...resume.projects].flatMap((entry) => [...entry.bullets, entry.rawLines.join(' ')]),
    resume.summary ?? '',
  ].filter(Boolean);
  const unitStems = units.map((unit) => ({ unit, stems: new Set(contentStems(unit)) }));
  const skills = resumeSkillMap(resume);

  return job.responsibilities.map((responsibility) => {
    const keywords = responsibility.keywords.filter((keyword) => !GENERIC_STEMS.has(keyword));
    let best = { unit: null as string | null, matched: [] as string[], coverage: 0 };
    for (const { unit, stems } of unitStems) {
      const matched = keywords.filter((keyword) => stems.has(keyword));
      const coverage = keywords.length ? matched.length / keywords.length : 0;
      if (coverage > best.coverage) best = { unit, matched, coverage };
    }
    const skillCoverage = responsibility.skills.length
      ? responsibility.skills.reduce((total, id) => {
          const skill = skills.get(id);
          return total + (!skill ? 0 : skill.evidenceStrength === 'LOW' ? 0.5 : 1);
        }, 0) / responsibility.skills.length
      : null;
    const coverage = skillCoverage === null ? best.coverage : 0.5 * best.coverage + 0.5 * skillCoverage;
    const state: MatchState = coverage >= 0.7 ? 'STRONG_MATCH' : coverage >= 0.5 ? 'MATCH' : coverage >= 0.3 ? 'PARTIAL_MATCH' : coverage > 0.1 ? 'WEAK_EVIDENCE' : 'MISSING';
    const credit = state === 'PARTIAL_MATCH' ? 0.5 : state === 'WEAK_EVIDENCE' ? 0.25 : STATE_CREDIT[state];
    return {
      requirementId: responsibility.id,
      responsibility: responsibility.text,
      coverage: round1(coverage * 100) / 100,
      matchedTerms: unique([...best.matched, ...responsibility.skills.filter((id) => skills.has(id)).map(skillName)]),
      bestEvidence: best.unit,
      finalMatchState: state,
      credit,
    };
  });
};

const RELATED_FIELDS = /computer|cse|information|software|it\b|data science|artificial intelligence|ai|electronics|ece|mathematics|statistics|computer applications/i;

export const JOB_FIT_WEIGHTS = {
  mandatory: 45,
  preferred: 15,
  responsibilities: 15,
  relevance: 10,
  experience: 8,
  education: 7,
} as const;

export type JobFitResult = {
  score: number;
  components: ScoreComponent[];
  requirementMatches: RequirementMatch[];
  responsibilityMatches: ResponsibilityMatch[];
  pointLosses: PointLoss[];
  summary: { matched: number; partial: number; weak: number; missing: number; mandatoryCoverage: number };
};

const status = (ratio: number): ScoreComponent['status'] => (ratio >= 0.75 ? 'pass' : ratio >= 0.45 ? 'warn' : 'fail');

export const scoreJobFit = (job: StructuredJob, resume: StructuredResume): JobFitResult => {
  const skills = resumeSkillMap(resume);
  const mandatory = job.mandatorySkills.map((req) => matchSkillRequirement(req, skills));
  const preferred = job.preferredSkills.map((req) => matchSkillRequirement(req, skills));
  const responsibilities = matchResponsibilities(job, resume);

  const weightedRatio = (matches: RequirementMatch[], reqs: JobSkillRequirement[]) => {
    const totalWeight = reqs.reduce((total, req) => total + req.weight, 0);
    if (totalWeight === 0) return 0;
    return matches.reduce((total, match, index) => total + reqs[index].weight * match.credit, 0) / totalWeight;
  };

  // Project / experience relevance: average JD-skill overlap of the two most relevant entries.
  const jdSkillIds = new Set([...job.mandatorySkills, ...job.preferredSkills].map((req) => req.canonical));
  const entries = [...resume.projects, ...resume.internships, ...resume.experience];
  const entryRelevance = entries
    .map((entry) => {
      const overlap = unique([...entry.technologies, ...expandImplied(entry.technologies).keys()]).filter((id) => jdSkillIds.has(id));
      return { title: entry.title, overlap, relevance: Math.min(1, overlap.length / 3) };
    })
    .sort((a, b) => b.relevance - a.relevance);
  const topTwo = entryRelevance.slice(0, 2);
  const relevanceRatio = (topTwo[0]?.relevance ?? 0) / 2 + (topTwo[1]?.relevance ?? 0) / 2;

  // Experience level.
  const candidateYears = (resume.stats.totalExperienceMonths + 0.5 * resume.stats.internshipMonths) / 12;
  const minYears = job.experience.minYears;
  const experienceApplicable = minYears !== null && minYears > 0;
  const experienceRatio = experienceApplicable ? Math.min(1, candidateYears / (minYears as number)) : 1;

  // Education.
  const educationApplicable = job.education.minLevel !== null;
  const candidateLevel = resume.education.reduce((best, entry) => Math.max(best, entry.degreeLevel ? degreeLevelRank[entry.degreeLevel] : -1), -1);
  const levelOk = educationApplicable && candidateLevel >= degreeLevelRank[job.education.minLevel!];
  const candidateFields = resume.education.map((entry) => entry.field ?? '').join(' ');
  const fieldOk = job.education.fields.length === 0 || RELATED_FIELDS.test(candidateFields) || job.education.fields.some((field) => candidateFields.toLowerCase().includes(field.toLowerCase()));
  const educationRatio = !educationApplicable ? 1 : (levelOk ? 0.7 : 0) + (fieldOk ? 0.3 : 0);

  const describeSkills = (matches: RequirementMatch[], kind: string) => {
    if (!matches.length) return `Not scored: the JD lists no ${kind} skills.`;
    const count = (state: MatchState) => matches.filter((match) => match.finalMatchState === state).length;
    const parts = [
      [count('STRONG_MATCH'), 'strong'],
      [count('MATCH'), 'matched'],
      [count('WEAK_EVIDENCE'), 'with weak evidence'],
      [count('PARTIAL_MATCH'), 'transferable only'],
      [count('MISSING'), 'missing'],
    ].filter(([value]) => value) as Array<[number, string]>;
    return `Of ${matches.length} ${kind} requirement${matches.length === 1 ? '' : 's'}: ${parts.map(([value, label]) => `${value} ${label}`).join(', ')}.`;
  };
  const evidencedResponsibilities = responsibilities.filter((match) => match.finalMatchState === 'STRONG_MATCH' || match.finalMatchState === 'MATCH').length;

  const raw: Array<Omit<ScoreComponent, 'weight' | 'earned' | 'status'> & { baseWeight: number }> = [
    {
      id: 'mandatory',
      label: 'Mandatory skills',
      baseWeight: JOB_FIT_WEIGHTS.mandatory,
      ratio: weightedRatio(mandatory, job.mandatorySkills),
      rule: 'Weighted credit per mandatory requirement: strong 100%, match 80%, weak evidence 40%, transferable ≤ 30%, missing 0%.',
      evidence: mandatory.map((match) => `${match.requirement}: ${match.finalMatchState}`),
      applicable: job.mandatorySkills.length > 0,
      summary: describeSkills(mandatory, 'mandatory'),
    },
    {
      id: 'preferred',
      label: 'Preferred skills',
      baseWeight: JOB_FIT_WEIGHTS.preferred,
      ratio: weightedRatio(preferred, job.preferredSkills),
      rule: 'Same credit rules as mandatory skills, applied to nice-to-have requirements.',
      evidence: preferred.map((match) => `${match.requirement}: ${match.finalMatchState}`),
      applicable: job.preferredSkills.length > 0,
      summary: describeSkills(preferred, 'preferred'),
    },
    {
      id: 'responsibilities',
      label: 'Responsibility alignment',
      baseWeight: JOB_FIT_WEIGHTS.responsibilities,
      ratio: responsibilities.length ? responsibilities.reduce((total, match) => total + match.credit, 0) / responsibilities.length : 0,
      rule: 'Keyword and skill overlap between each JD responsibility and your best matching bullet.',
      evidence: responsibilities.map((match) => `${match.responsibility.slice(0, 60)}: ${match.finalMatchState}`),
      applicable: responsibilities.length > 0,
      summary: responsibilities.length
        ? `${evidencedResponsibilities} of ${responsibilities.length} JD responsibilities are clearly evidenced by a bullet in your resume.`
        : 'Not scored: no responsibilities were found in the JD.',
    },
    {
      id: 'relevance',
      label: 'Project & experience relevance',
      baseWeight: JOB_FIT_WEIGHTS.relevance,
      ratio: relevanceRatio,
      rule: 'Average JD-technology overlap (3 technologies = full) of your two most relevant projects/internships.',
      evidence: topTwo.map((entry) => `${entry.title}: ${entry.overlap.map(skillName).join(', ') || 'no JD technologies'}`),
      applicable: jdSkillIds.size > 0,
      summary: topTwo.length
        ? `Your most relevant entries: ${topTwo.map((entry) => `“${entry.title}” (${entry.overlap.length} JD technolog${entry.overlap.length === 1 ? 'y' : 'ies'})`).join(' and ')}. Three JD technologies per entry earns full credit.`
        : 'No projects, internships or experience entries were found.',
    },
    {
      id: 'experience',
      label: 'Experience level',
      baseWeight: JOB_FIT_WEIGHTS.experience,
      ratio: experienceRatio,
      rule: 'Candidate years (full-time + 50% of internship time) compared with the JD minimum.',
      evidence: [`Required: ${job.experience.raw ?? 'not specified'}`, `Detected: ${round1(candidateYears)} years equivalent`],
      applicable: experienceApplicable,
      summary: experienceApplicable
        ? `The JD asks for ${job.experience.raw}; your resume shows about ${round1(candidateYears)} years (internships count at 50%).`
        : 'Not scored: the JD does not require prior experience, so freshers are not penalised.',
    },
    {
      id: 'education',
      label: 'Education',
      baseWeight: JOB_FIT_WEIGHTS.education,
      ratio: educationRatio,
      rule: 'Degree level (70%) and field of study (30%) against the JD requirement.',
      evidence: [`Required: ${job.education.raw ?? 'not specified'}`, `Detected: ${resume.education.map((entry) => entry.degree ?? entry.raw.split('\n')[0]).join('; ') || 'none'}`],
      applicable: educationApplicable,
      summary: educationApplicable
        ? `${levelOk ? 'Your degree level meets' : 'No degree meeting'} the requirement (${job.education.raw})${levelOk ? '' : ' was detected'}${fieldOk ? '' : '; field of study does not match'}.`
        : 'Not scored: the JD states no education requirement.',
    },
  ];

  const applicableWeight = raw.filter((component) => component.applicable).reduce((total, component) => total + component.baseWeight, 0) || 1;
  const components: ScoreComponent[] = raw.map(({ baseWeight, ...component }) => {
    const weight = component.applicable ? (baseWeight / applicableWeight) * 100 : 0;
    const ratio = Math.max(0, Math.min(1, component.ratio));
    return { ...component, ratio, weight: round1(weight), earned: round1(weight * ratio), status: component.applicable ? status(ratio) : 'pass' };
  });

  const score = round1(components.reduce((total, component) => total + component.earned, 0));

  // Point-loss attribution: every lost point is traced back to a specific requirement or rule.
  const losses: PointLoss[] = [];
  const addLoss = (id: string, label: string, category: string, items: PointLoss['items']) => {
    const filtered = items.filter((item) => item.points > 0.04);
    if (!filtered.length) return;
    losses.push({ id, label, category, points: round1(filtered.reduce((total, item) => total + item.points, 0)), items: filtered.map((item) => ({ ...item, points: round1(item.points) })) });
  };

  const skillLosses = (componentId: 'mandatory' | 'preferred', matches: RequirementMatch[], reqs: JobSkillRequirement[], prefix: string) => {
    const component = components.find((c) => c.id === componentId)!;
    if (!component.applicable) return;
    const totalWeight = reqs.reduce((total, req) => total + req.weight, 0);
    const lossOf = (match: RequirementMatch, index: number) => (component.weight * reqs[index].weight * (1 - match.credit)) / totalWeight;
    const group = (state: MatchState) =>
      matches.map((match, index) => ({ match, index })).filter(({ match }) => match.finalMatchState === state).map(({ match, index }) => ({ label: match.requirement, points: lossOf(match, index), requirementId: match.requirementId }));
    addLoss(`${componentId}-missing`, `${prefix} skill missing`, component.label, group('MISSING'));
    addLoss(`${componentId}-partial`, `${prefix} skill only transferable`, component.label, group('PARTIAL_MATCH'));
    addLoss(`${componentId}-weak`, `${prefix} skill with weak evidence`, component.label, group('WEAK_EVIDENCE'));
    addLoss(`${componentId}-match`, `${prefix} skill not shown in depth`, component.label, group('MATCH'));
  };
  skillLosses('mandatory', mandatory, job.mandatorySkills, 'Mandatory');
  skillLosses('preferred', preferred, job.preferredSkills, 'Preferred');

  const responsibilityComponent = components.find((c) => c.id === 'responsibilities')!;
  if (responsibilityComponent.applicable) {
    addLoss(
      'responsibilities',
      'Responsibility mismatch',
      responsibilityComponent.label,
      responsibilities.map((match) => ({ label: match.responsibility, points: (responsibilityComponent.weight * (1 - match.credit)) / responsibilities.length, requirementId: match.requirementId })),
    );
  }
  const simpleLoss = (id: string, label: string, detail: string) => {
    const component = components.find((c) => c.id === id)!;
    if (component.applicable) addLoss(id, label, component.label, [{ label: detail, points: component.weight - component.earned }]);
  };
  simpleLoss('relevance', 'Weak project/experience relevance', 'Projects and internships use few of the JD technologies');
  simpleLoss('experience', 'Experience below requirement', `JD asks for ${job.experience.raw ?? 'more experience'}`);
  simpleLoss('education', 'Education mismatch', `JD asks for ${job.education.raw ?? 'a specific degree'}`);

  // Re-anchor rounding so that score + losses === 100 exactly (rounding drift goes to the largest loss).
  const lossTotal = round1(losses.reduce((total, loss) => total + loss.points, 0));
  const drift = round1(100 - score - lossTotal);
  if (losses.length && Math.abs(drift) > 0 && Math.abs(drift) <= 0.5) {
    const largest = losses.reduce((max, loss) => (loss.points > max.points ? loss : max), losses[0]);
    largest.points = round1(largest.points + drift);
  }

  const all = [...mandatory, ...preferred];
  return {
    score,
    components,
    requirementMatches: all,
    responsibilityMatches: responsibilities,
    pointLosses: losses.sort((a, b) => b.points - a.points),
    summary: {
      matched: all.filter((match) => match.finalMatchState === 'STRONG_MATCH' || match.finalMatchState === 'MATCH').length,
      partial: all.filter((match) => match.finalMatchState === 'PARTIAL_MATCH').length,
      weak: all.filter((match) => match.finalMatchState === 'WEAK_EVIDENCE').length,
      missing: all.filter((match) => match.finalMatchState === 'MISSING').length,
      mandatoryCoverage: mandatory.length ? round1((mandatory.filter((match) => match.exactMatch).length / mandatory.length) * 100) : 100,
    },
  };
};
