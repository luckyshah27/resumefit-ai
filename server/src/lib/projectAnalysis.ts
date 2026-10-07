import { expandImplied, skillName } from './skillOntology.js';
import type { ResumeEntry, StructuredJob } from './types.js';
import { hasMetric, round1, startsWithActionVerb, unique } from '../utils/text.js';

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
  /** Informational flags (not scored), e.g. generic wording or missing dates. */
  flags: string[];
  isFinalYearProject?: boolean;
  /** Internships/experience only: does the role title relate to the target JD role? */
  roleRelevance?: 'related' | 'unrelated' | 'unknown';
};

const GENERIC_PHRASES = /\b(worked on (various|different|multiple|several)|various tasks|(gained|got) (exposure|knowledge|experience)|learn(ed|t) (a lot|about|many)|assisted (the team|seniors|in day-to-day)|helped (the team|with tasks)|responsible for|involved in|day[- ]to[- ]day (tasks|activities)|other duties)\b/i;

const ROLE_FAMILIES: Array<[string, RegExp]> = [
  ['software', /\b(software|sde|swe|developer|engineer|programm|full[- ]?stack|back[- ]?end|front[- ]?end|web|mobile|app)\w*/i],
  ['data', /\b(data|analyst|analytics|bi|business intelligence|machine learning|ml|ai|scientist)\w*/i],
  ['devops', /\b(devops|cloud|sre|site reliability|platform|infrastructure)\w*/i],
  ['design', /\b(designer|ui|ux|product design)\w*/i],
  ['qa', /\b(qa|quality|test(ing|er)?)\b/i],
  ['business', /\b(marketing|sales|hr|human resources|finance|accounting|operations|content|business development|recruit)\w*/i],
];

const roleFamilies = (title: string) => new Set(ROLE_FAMILIES.filter(([, pattern]) => pattern.test(title)).map(([family]) => family));

export const roleRelevanceOf = (title: string, job?: StructuredJob): EntryAnalysis['roleRelevance'] => {
  if (!job || job.role === 'Unspecified role') return 'unknown';
  const entryFamilies = roleFamilies(title);
  const jobFamilies = roleFamilies(job.role);
  if (!entryFamilies.size || !jobFamilies.size) return 'unknown';
  return [...entryFamilies].some((family) => jobFamilies.has(family)) ? 'related' : 'unrelated';
};

const entryFlags = (entry: ResumeEntry, kind: EntryAnalysis['kind']) => {
  const flags: string[] = [];
  const generic = entry.bullets.filter((bullet) => GENERIC_PHRASES.test(bullet));
  if (generic.length) flags.push(`Generic description: “${generic[0].slice(0, 80)}${generic[0].length > 80 ? '…' : ''}” — say what you built and with what.`);
  if (!entry.technologies.length) flags.push('No technologies named.');
  if (entry.bullets.length && !entry.bullets.some(hasMetric)) flags.push('No measurable impact (users, %, time, records…).');
  if (kind !== 'project' && !entry.dates) flags.push('Dates not detected.');
  if (!entry.bullets.length) flags.push('No bullet points describing the work.');
  return flags;
};

const DEPTH_TERMS = /\b(architecture|api|apis|database|schema|authentication|authorization|caching|cache|deploy\w*|testing|tests|ci\/?cd|pipeline|model|real-time|optimi[sz]\w*|security|indexing|queue|microservice\w*|state management|websocket\w*|docker\w*|cloud|algorithm\w*|data model\w*|orm|rest|graphql)\b/gi;
const COMPLEXITY_TERMS = /\b(authentication|role-based|real-time|websocket\w*|microservice\w*|distributed|scal\w+|deploy\w*|ci\/?cd|docker|kubernetes|cloud|machine learning|ml model|trained|pipeline|concurren\w*|cach\w+|payment\w*|search|recommend\w*|integration|third-party|oauth|encryption|load|latency|throughput|pagination|queue|cron|notifications?)\b/gi;

const countMatches = (text: string, pattern: RegExp) => unique((text.match(pattern) ?? []).map((term) => term.toLowerCase())).length;

const weighted = (dimensions: DimensionScore[]) => {
  const totalWeight = dimensions.reduce((total, dimension) => total + dimension.weight, 0) || 1;
  return round1((dimensions.reduce((total, dimension) => total + dimension.score * dimension.weight, 0) / totalWeight) * 10);
};

const clarityScore = (entry: ResumeEntry) => {
  if (entry.bullets.length === 0) return { score: 2, note: 'No descriptive bullets; add 2-4 bullets describing what you built.' };
  const avgWords = entry.bullets.reduce((total, bullet) => total + bullet.split(/\s+/).length, 0) / entry.bullets.length;
  const lengthOk = avgWords >= 8 && avgWords <= 30;
  const countScore = Math.min(1, entry.bullets.length / 3);
  return {
    score: round1(10 * (0.5 * countScore + 0.5 * (lengthOk ? 1 : avgWords < 8 ? avgWords / 8 : 30 / avgWords))),
    note: `${entry.bullets.length} bullet(s), ${round1(avgWords)} words on average (8-30 is easiest to scan).`,
  };
};

const relevanceOf = (technologies: string[], job?: StructuredJob) => {
  if (!job) return { relevant: [] as string[], score: null as number | null };
  const jdSkills = new Set([...job.mandatorySkills, ...job.preferredSkills].map((req) => req.canonical));
  const expanded = unique([...technologies, ...expandImplied(technologies).keys()]);
  const relevant = expanded.filter((id) => jdSkills.has(id));
  return { relevant, score: Math.min(10, (relevant.length / 3) * 10) };
};

const finish = (entry: ResumeEntry, kind: EntryAnalysis['kind'], dimensions: DimensionScore[], relevant: string[]): EntryAnalysis => {
  const strengths = dimensions.filter((dimension) => dimension.score >= 7.5).map((dimension) => `${dimension.label}: ${dimension.note}`);
  const improvements = dimensions.filter((dimension) => dimension.score < 5).map((dimension) => `${dimension.label}: ${dimension.note}`);
  return {
    title: entry.title,
    organization: entry.organization,
    kind,
    technologies: entry.technologies.map(skillName),
    relevantTechnologies: relevant.map(skillName),
    durationMonths: entry.durationMonths,
    dimensions: dimensions.map((dimension) => ({ ...dimension, score: round1(dimension.score) })),
    overall: weighted(dimensions),
    strengths,
    improvements,
    flags: entryFlags(entry, kind),
    isFinalYearProject: kind === 'project' ? Boolean(entry.isFinalYearProject) : undefined,
  };
};

export const analyzeProject = (entry: ResumeEntry, job?: StructuredJob): EntryAnalysis => {
  const text = [...entry.rawLines, ...entry.bullets].join(' ');
  const techCount = entry.technologies.length;
  const depthTerms = countMatches(text, DEPTH_TERMS);
  const complexityTerms = countMatches(text, COMPLEXITY_TERMS);
  const actionBullets = entry.bullets.filter(startsWithActionVerb).length;
  const metricBullets = entry.bullets.filter(hasMetric).length;
  const clarity = clarityScore(entry);
  const { relevant, score: relevanceScore } = relevanceOf(entry.technologies, job);

  const dimensions: DimensionScore[] = [
    { id: 'depth', label: 'Technical depth', weight: 20, score: Math.min(10, techCount * 1.5 + depthTerms * 1.5), note: `${techCount} technologies and ${depthTerms} engineering concept(s) mentioned.` },
    { id: 'technologies', label: 'Technologies', weight: 10, score: Math.min(10, techCount * 2.5), note: techCount ? entry.technologies.map(skillName).join(', ') : 'No recognisable technologies named.' },
    ...(relevanceScore === null ? [] : [{ id: 'relevance', label: 'Relevance to JD', weight: 20, score: relevanceScore, note: relevant.length ? `Uses ${relevant.map(skillName).join(', ')} from the JD.` : 'Uses none of the JD technologies.' }]),
    { id: 'complexity', label: 'Complexity', weight: 15, score: Math.min(10, complexityTerms * 2.5), note: complexityTerms ? `${complexityTerms} complexity signal(s) such as auth, deployment, real-time or scale.` : 'No complexity signals (auth, deployment, scale, real-time, ML) described.' },
    { id: 'implementation', label: 'Implementation evidence', weight: 15, score: Math.min(10, actionBullets * 3.5), note: `${actionBullets} bullet(s) start with a concrete action verb.` },
    { id: 'outcome', label: 'Measurable outcome', weight: 10, score: metricBullets >= 2 ? 10 : metricBullets === 1 ? 6 : 0, note: metricBullets ? `${metricBullets} bullet(s) include a number or metric.` : 'No measurable result (users, latency, accuracy, records...).' },
    { id: 'clarity', label: 'Clarity', weight: 10, score: clarity.score, note: clarity.note },
  ];
  return finish(entry, 'project', dimensions, relevant);
};

export const analyzeInternship = (entry: ResumeEntry, job?: StructuredJob, kind: 'internship' | 'experience' = 'internship'): EntryAnalysis => {
  const techCount = entry.technologies.length;
  const actionBullets = entry.bullets.filter(startsWithActionVerb).length;
  const metricBullets = entry.bullets.filter(hasMetric).length;
  const clarity = clarityScore(entry);
  const { relevant, score: relevanceScore } = relevanceOf(entry.technologies, job);
  const months = entry.durationMonths ?? null;

  const dimensions: DimensionScore[] = [
    { id: 'duration', label: 'Duration', weight: 10, score: months === null ? 4 : Math.min(10, (months / 3) * 10), note: months === null ? 'Dates not detected; add start and end month.' : `${months} month(s).` },
    { id: 'technologies', label: 'Technologies used', weight: 15, score: Math.min(10, techCount * 2.5), note: techCount ? entry.technologies.map(skillName).join(', ') : 'No technologies named.' },
    ...(relevanceScore === null ? [] : [{ id: 'relevance', label: 'Relevance to JD', weight: 20, score: relevanceScore, note: relevant.length ? `Uses ${relevant.map(skillName).join(', ')} from the JD.` : 'Uses none of the JD technologies.' }]),
    { id: 'impact', label: 'Measurable impact', weight: 20, score: metricBullets >= 2 ? 10 : metricBullets === 1 ? 6 : 0, note: metricBullets ? `${metricBullets} bullet(s) quantify impact.` : 'No quantified impact.' },
    { id: 'ownership', label: 'Ownership & action', weight: 20, score: Math.min(10, actionBullets * 3.5), note: `${actionBullets} bullet(s) describe work you did with an action verb.` },
    { id: 'clarity', label: 'Clarity', weight: 15, score: clarity.score, note: clarity.note },
  ];
  return { ...finish(entry, kind, dimensions, relevant), roleRelevance: roleRelevanceOf(`${entry.title} ${entry.organization ?? ''}`, job) };
};
