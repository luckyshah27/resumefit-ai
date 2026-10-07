import type { AnalysisReport } from './scoringEngine.js';
import { findSkillMentions } from './skillOntology.js';
import { round1 } from '../utils/text.js';

type Comparable = Pick<AnalysisReport, 'scores' | 'jobFit' | 'ats' | 'quality'>;

export type ScoreDelta = { key: keyof AnalysisReport['scores']; label: string; before: number; after: number; delta: number };
export type CategoryDelta = { group: 'Job Fit' | 'ATS Readiness' | 'Resume Quality'; id: string; label: string; before: number; after: number; delta: number; weight: number };
export type RequirementChange = { requirement: string; canonical: string; importance: string; before: string; after: string };

/** A recorded edit between two versions (fix applied, manual edit line, or restore). */
export type ChangeRecord = { id: string; type?: string; operation: string; before: string | null; after: string; applied: boolean; reason?: string };

export type Attribution = {
  target: string;
  group: 'Requirement' | CategoryDelta['group'];
  delta: number | null;
  causes: Array<{ changeId: string; text: string; why: string }>;
};

export type ReportComparison = {
  scores: ScoreDelta[];
  categories: CategoryDelta[];
  changedCategories: CategoryDelta[];
  requirementChanges: RequirementChange[];
  /** Which recorded edits are linked to each difference (empty when no change log is available). */
  attribution: Attribution[];
};

/** Score components each kind of edit is designed to move. Used only to link causes, never to compute deltas. */
const TYPE_TARGETS: Record<string, string[]> = {
  'weak-verb': ['action-verbs', 'projects', 'internships', 'readability'],
  'add-metric': ['outcomes', 'projects', 'internships'],
  summary: ['completeness', 'responsibilities', 'relevance', 'keywords'],
  'add-evidence': ['mandatory', 'preferred', 'responsibilities', 'relevance', 'specificity', 'projects', 'internships', 'readability', 'outcomes', 'action-verbs'],
  responsibility: ['responsibilities', 'mandatory', 'preferred', 'specificity', 'readability', 'outcomes', 'action-verbs'],
  'keyword-alignment': ['keywords'],
  heading: ['headings'],
  contact: ['contact', 'completeness'],
  'missing-skill': ['mandatory', 'keywords', 'skills-section'],
};

const typeOf = (change: ChangeRecord) => change.type ?? change.id.replace(/^fix-\d+-/, '');

/** Links each requirement/category difference to the recorded edits that plausibly caused it. */
export const attributeChanges = (comparison: Omit<ReportComparison, 'attribution'>, changes: ChangeRecord[]): Attribution[] => {
  const applied = changes.filter((change) => change.applied);
  if (!applied.length) return [];
  const short = (text: string) => (text.length > 110 ? `${text.slice(0, 107)}…` : text);

  const requirementAttribution: Attribution[] = comparison.requirementChanges.map((change) => ({
    target: change.requirement,
    group: 'Requirement',
    delta: null,
    causes: applied
      .filter((record) => findSkillMentions(record.after).some((mention) => mention.skillId === change.canonical))
      .map((record) => ({ changeId: record.id, text: short(record.after), why: `Adds evidence that mentions ${change.requirement}.` })),
  }));

  const categoryAttribution: Attribution[] = comparison.changedCategories.map((category) => {
    const causes = applied
      .filter((record) => typeOf(record) === 'manual-edit' || typeOf(record) === 'restore' || (TYPE_TARGETS[typeOf(record)] ?? []).includes(category.id))
      .map((record) => ({ changeId: record.id, text: short(record.after), why: typeOf(record) === 'manual-edit' ? 'Manual edit.' : typeOf(record) === 'restore' ? 'Restored content.' : `A “${typeOf(record)}” fix targets this category.` }));
    return {
      target: category.label,
      group: category.group,
      delta: category.delta,
      causes: causes.length ? causes : [{ changeId: '', text: '', why: 'Indirect effect: ratios in this category shifted because other content changed (e.g. more bullets in total).' }],
    };
  });

  return [...requirementAttribution, ...categoryAttribution];
};

const SCORE_LABELS: Record<keyof AnalysisReport['scores'], string> = {
  jobFit: 'Job Fit',
  atsReadiness: 'ATS Readiness',
  resumeQuality: 'Resume Quality',
  interviewReadiness: 'Interview Readiness',
};

/** Compares two reports produced by the same deterministic engine. Deltas are computed, never authored. */
export const compareReports = (before: Comparable, after: Comparable, changes: ChangeRecord[] = []): ReportComparison => {
  const scores = (Object.keys(SCORE_LABELS) as Array<keyof AnalysisReport['scores']>).map((key) => ({
    key,
    label: SCORE_LABELS[key],
    before: before.scores[key],
    after: after.scores[key],
    delta: round1(after.scores[key] - before.scores[key]),
  }));

  const group = (name: CategoryDelta['group'], a: Comparable['jobFit']['components'], b: Comparable['jobFit']['components']) =>
    b.map((component) => {
      const previous = a.find((item) => item.id === component.id);
      return { group: name, id: component.id, label: component.label, weight: component.weight, before: previous?.earned ?? 0, after: component.earned, delta: round1(component.earned - (previous?.earned ?? 0)) };
    });

  const categories = [
    ...group('Job Fit', before.jobFit.components, after.jobFit.components),
    ...group('ATS Readiness', before.ats.checks, after.ats.checks),
    ...group('Resume Quality', before.quality.components, after.quality.components),
  ];

  const requirementChanges = after.jobFit.requirementMatches
    .map((match) => {
      const previous = before.jobFit.requirementMatches.find((item) => item.requirementId === match.requirementId);
      return { requirement: match.requirement, canonical: match.canonical, importance: match.importance, before: previous?.finalMatchState ?? 'NEW', after: match.finalMatchState };
    })
    .filter((change) => change.before !== change.after);

  const base = { scores, categories, changedCategories: categories.filter((category) => Math.abs(category.delta) >= 0.1), requirementChanges };
  return { ...base, attribution: attributeChanges(base, changes) };
};

/** Turns a line diff into change records so manual edits can be attributed like fixes. */
export const changesFromDiff = (beforeText: string, afterText: string, type: 'manual-edit' | 'restore' = 'manual-edit'): ChangeRecord[] => {
  const diff = diffLines(beforeText, afterText);
  return diff
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.type === 'added' && line.text.trim())
    .map(({ line, index }) => {
      const removed = diff[index - 1]?.type === 'removed' ? diff[index - 1].text : null;
      return { id: `${type}-${index}`, type, operation: removed ? 'replace' : 'insert_after', before: removed, after: line.text.trim(), applied: true };
    });
};

export type DiffLine = { type: 'same' | 'added' | 'removed'; text: string };

/** Line-level LCS diff (resumes are small, O(n*m) is fine). */
export const diffLines = (beforeText: string, afterText: string): DiffLine[] => {
  const a = beforeText.split('\n');
  const b = afterText.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: 'removed', text: a[i] });
      i += 1;
    } else {
      result.push({ type: 'added', text: b[j] });
      j += 1;
    }
  }
  while (i < n) result.push({ type: 'removed', text: a[i++] });
  while (j < m) result.push({ type: 'added', text: b[j++] });
  return result;
};
