import { expandImplied, findSkillIds, findSkillMentions, skillName } from './skillOntology.js';

export type GuardViolation = { type: 'new-skill' | 'new-number' | 'new-entity'; value: string };
export type GuardResult = { ok: boolean; violations: GuardViolation[] };

export const PLACEHOLDER_PATTERN = /\[[^\]]{2,120}\]/g;

export const hasPlaceholders = (text: string) => new RegExp(PLACEHOLDER_PATTERN.source).test(text);

const SAFE_ENTITY_WORDS = new Set([
  'summary', 'education', 'skills', 'experience', 'projects', 'internships', 'certifications', 'achievements', 'technical',
  'aspiring', 'final-year', 'hands-on', 'contributed', 'supported', 'created', 'performed', 'developed', 'built', 'designed',
  'implemented', 'managed', 'took', 'wrote', 'tested', 'maintained', 'used', 'applied', 'student', 'graduate', 'engineer',
]);

const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => value.replace(/,/g, ''));

const entitiesIn = (text: string) =>
  (text.match(/\b[A-Z][a-zA-Z0-9&.+-]*(?:\s+[A-Z][a-zA-Z0-9&.+-]*)*/g) ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 1);

/**
 * Detects facts present in `suggested` that are not supported by `source`.
 * Placeholders like "[add a real metric]" are ignored: they are instructions to the user.
 * `allowedTerms` are target-role words from the JD that may appear (e.g. "Aspiring Data Analyst").
 */
export const checkFabrication = (source: string, suggested: string, allowedTerms: string[] = []): GuardResult => {
  const text = suggested.replace(PLACEHOLDER_PATTERN, ' ');
  const sourceLower = source.toLowerCase();
  const allowedLower = allowedTerms.join(' ').toLowerCase();
  const violations: GuardViolation[] = [];

  const sourceSkills = new Set(findSkillIds(source));
  expandImplied(sourceSkills).forEach((_via, id) => sourceSkills.add(id));
  const allowedSkills = new Set(findSkillIds(allowedTerms.join(' ')));
  for (const id of findSkillIds(text)) {
    if (!sourceSkills.has(id) && !allowedSkills.has(id)) violations.push({ type: 'new-skill', value: skillName(id) });
  }

  const sourceNumbers = new Set(numbersIn(source));
  for (const value of numbersIn(text)) {
    if (!sourceNumbers.has(value)) violations.push({ type: 'new-number', value });
  }

  // Skill names were validated above; remove them so "Unit Testing" is not treated as an unknown entity.
  let entityText = text;
  for (const mention of findSkillMentions(text).reverse()) entityText = `${entityText.slice(0, mention.index)} , ${entityText.slice(mention.end)}`;
  for (const entity of entitiesIn(entityText)) {
    const words = entity.split(/\s+/);
    const unknown = words.filter((word) => {
      const lower = word.toLowerCase().replace(/[.,]$/, '');
      return !SAFE_ENTITY_WORDS.has(lower) && !sourceLower.includes(lower) && !allowedLower.includes(lower) && findSkillIds(word).length === 0;
    });
    if (unknown.length > 0) violations.push({ type: 'new-entity', value: entity });
  }

  return { ok: violations.length === 0, violations };
};
