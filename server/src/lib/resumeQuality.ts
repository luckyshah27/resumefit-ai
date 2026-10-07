import { findSkillMentions } from './skillOntology.js';
import type { EntryAnalysis } from './projectAnalysis.js';
import type { CheckStatus, PointLoss, ScoreComponent, StructuredJob, StructuredResume } from './types.js';
import { BULLET_PATTERN, DATE_RANGE, hasMetric, round1, startsWithActionVerb } from '../utils/text.js';

export type QualityResult = { score: number; components: ScoreComponent[]; pointLosses: PointLoss[] };

const statusOf = (ratio: number): CheckStatus => (ratio >= 0.75 ? 'pass' : ratio >= 0.45 ? 'warn' : 'fail');

/** Fraction relative to a target, capped at 1 (e.g. 40% metric bullets is "full marks"). */
const toward = (value: number, target: number) => Math.min(1, target === 0 ? 1 : value / target);

export const allBullets = (resume: StructuredResume) => [...resume.experience, ...resume.internships, ...resume.projects].flatMap((entry) => entry.bullets);

export const scoreResumeQuality = (
  resume: StructuredResume,
  rawText: string,
  analyses: { projects: EntryAnalysis[]; internships: EntryAnalysis[] },
  job?: StructuredJob,
): QualityResult => {
  const bullets = allBullets(resume);
  const has = (key: string) => resume.sections.some((section) => section.key === key);
  const components: Array<Omit<ScoreComponent, 'earned' | 'status' | 'applicable'>> = [];

  // Completeness (15)
  const parts = [
    { label: 'email/phone', points: 2, ok: Boolean(resume.candidate.email || resume.candidate.phone) },
    { label: 'education', points: 3, ok: resume.education.length > 0 },
    { label: 'skills', points: 3, ok: has('skills') },
    { label: 'projects', points: 3, ok: resume.projects.length > 0 },
    { label: 'experience/internships', points: 2, ok: resume.experience.length + resume.internships.length > 0 },
    { label: 'summary', points: 1, ok: Boolean(resume.summary) },
    { label: 'profile links', points: 1, ok: resume.links.length > 0 },
  ];
  components.push({
    id: 'completeness',
    label: 'Completeness',
    weight: 15,
    ratio: parts.reduce((total, part) => total + (part.ok ? part.points : 0), 0) / 15,
    rule: 'Contact, education, skills, projects, experience, summary and links present.',
    evidence: parts.map((part) => `${part.ok ? '✓' : '✗'} ${part.label}`),
  });

  // Readability (10)
  const avgWords = bullets.length ? bullets.reduce((total, bullet) => total + bullet.split(/\s+/).length, 0) / bullets.length : 0;
  const inRange = bullets.filter((bullet) => {
    const words = bullet.split(/\s+/).length;
    return words >= 8 && words <= 30;
  }).length;
  const words = resume.stats.wordCount;
  const lengthRatio = words >= 250 && words <= 900 ? 1 : words < 250 ? words / 250 : 900 / words;
  components.push({
    id: 'readability',
    label: 'Readability',
    weight: 10,
    ratio: 0.4 * toward(resume.stats.bulletCount, 5) + 0.3 * (bullets.length ? inRange / bullets.length : 0) + 0.3 * lengthRatio,
    rule: 'Bulleted content (5+), bullets of 8-30 words, total length 250-900 words.',
    evidence: [`${resume.stats.bulletCount} bullets`, `${round1(avgWords)} words per bullet`, `${words} words total`],
  });

  // Technical specificity (15)
  const technical = bullets.filter((bullet) => findSkillMentions(bullet).length > 0).length;
  components.push({
    id: 'specificity',
    label: 'Technical specificity',
    weight: 15,
    ratio: bullets.length ? toward(technical / bullets.length, 0.6) : 0,
    rule: 'At least 60% of bullets name a concrete technology.',
    evidence: [`${technical}/${bullets.length} bullets name a technology`],
  });

  // Project quality (15)
  const topProjects = [...analyses.projects].sort((a, b) => b.overall - a.overall).slice(0, 3);
  components.push({
    id: 'projects',
    label: 'Project quality',
    weight: 15,
    ratio: topProjects.length ? topProjects.reduce((total, project) => total + project.overall, 0) / topProjects.length / 100 : 0,
    rule: 'Average score of your top three projects (depth, complexity, evidence, outcomes, clarity).',
    evidence: topProjects.map((project) => `${project.title}: ${project.overall}/100`),
  });

  // Internship quality (10) — no internship yields a 30% baseline rather than zero.
  const work = analyses.internships;
  components.push({
    id: 'internships',
    label: 'Internship / experience quality',
    weight: 10,
    ratio: work.length ? work.reduce((total, entry) => total + entry.overall, 0) / work.length / 100 : 0.3,
    rule: 'Average internship/experience score; 30% baseline when none is listed.',
    evidence: work.length ? work.map((entry) => `${entry.title}: ${entry.overall}/100`) : ['No internship or experience entries'],
  });

  // Action verbs (10)
  const actionCount = bullets.filter(startsWithActionVerb).length;
  components.push({
    id: 'action-verbs',
    label: 'Action verbs',
    weight: 10,
    ratio: bullets.length ? toward(actionCount / bullets.length, 0.8) : 0,
    rule: '80% of bullets start with a strong action verb (Built, Designed, Optimized...).',
    evidence: [`${actionCount}/${bullets.length} bullets start with a strong verb`],
  });

  // Measurable outcomes (10)
  const metricCount = bullets.filter(hasMetric).length;
  components.push({
    id: 'outcomes',
    label: 'Measurable outcomes',
    weight: 10,
    ratio: bullets.length ? toward(metricCount / bullets.length, 0.4) : 0,
    rule: 'At least 40% of bullets include a number (users, %, latency, records...).',
    evidence: [`${metricCount}/${bullets.length} bullets include a metric`],
  });

  // Consistency (5)
  const lines = rawText.split('\n');
  const bulletChars = new Set(lines.filter((line) => BULLET_PATTERN.test(line)).map((line) => line.trim()[0]));
  const dateFormats = new Set((rawText.match(new RegExp(DATE_RANGE.source, 'gi')) ?? []).map((range) => (/[a-z]{3}/i.test(range) ? 'month' : /\//.test(range) ? 'numeric' : 'year')));
  const duplicates = bullets.length - new Set(bullets.map((bullet) => bullet.toLowerCase())).size;
  components.push({
    id: 'consistency',
    label: 'Consistency',
    weight: 5,
    ratio: (bulletChars.size <= 1 ? 0.3 : 0.1) + (dateFormats.size <= 2 ? 0.4 : 0.1) + (duplicates === 0 ? 0.3 : 0),
    rule: 'One bullet style, consistent date format, no duplicated bullets.',
    evidence: [`Bullet styles: ${bulletChars.size}`, `Date formats: ${[...dateFormats].join(', ') || 'none'}`, `Duplicate bullets: ${duplicates}`],
  });

  // Relevance (10)
  if (job && job.mandatorySkills.length) {
    const skills = new Map(resume.skills.map((skill) => [skill.id, skill]));
    const demonstrated = job.mandatorySkills.filter((req) => {
      const skill = skills.get(req.canonical);
      return skill && skill.evidenceStrength !== 'LOW';
    });
    components.push({
      id: 'relevance',
      label: 'Relevance to target role',
      weight: 10,
      ratio: demonstrated.length / job.mandatorySkills.length,
      rule: 'Share of mandatory JD skills demonstrated beyond the skills list.',
      evidence: [`${demonstrated.length}/${job.mandatorySkills.length} mandatory skills demonstrated`],
    });
  } else {
    const contextual = resume.skills.filter((skill) => skill.evidenceStrength !== 'LOW').length;
    components.push({
      id: 'relevance',
      label: 'Relevance (skills backed by work)',
      weight: 10,
      ratio: resume.skills.length ? contextual / resume.skills.length : 0,
      rule: 'Share of listed skills backed by a project or experience.',
      evidence: [`${contextual}/${resume.skills.length} skills demonstrated`],
    });
  }

  const final: ScoreComponent[] = components.map((component) => {
    const ratio = Math.max(0, Math.min(1, component.ratio));
    return { ...component, ratio, earned: round1(component.weight * ratio), status: statusOf(ratio), applicable: true, summary: `${component.evidence.slice(0, 3).join('; ')}.` };
  });
  const score = round1(final.reduce((total, component) => total + component.earned, 0));
  const pointLosses: PointLoss[] = final
    .filter((component) => component.weight - component.earned > 0.04)
    .map((component) => ({ id: `quality-${component.id}`, label: component.label, category: 'Resume Quality', points: round1(component.weight - component.earned), items: [{ label: component.rule, points: round1(component.weight - component.earned) }] }))
    .sort((a, b) => b.points - a.points);

  return { score, components: final, pointLosses };
};
