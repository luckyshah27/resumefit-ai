import { DOMAIN_KEYWORDS, findSkillMentions, getSkill } from './skillOntology.js';
import { FIELD_PATTERN, degreeLevelRank, detectDegreeLevel } from './resumeStructurer.js';
import type { DegreeLevel, Importance, JobResponsibility, JobSkillRequirement, StructuredJob } from './types.js';
import { contentStems, isBulletLine, stripBullet, tokenize, unique } from '../utils/text.js';

type JdContext = 'responsibilities' | 'mandatory' | 'preferred' | 'about' | 'benefits' | 'none';

const JD_HEADINGS: Array<{ context: JdContext; pattern: RegExp }> = [
  { context: 'preferred', pattern: /^(nice[- ]to[- ]haves?|preferred( qualifications| skills)?|good[- ]to[- ]have|bonus( points)?|desirable( skills)?|pluses|additional (skills|qualifications)|it'?s a plus( if you have)?)\b/i },
  { context: 'responsibilities', pattern: /^((key |your |job |primary )?responsibilities|what you'?ll (do|work on)|what you will (do|work on)|the role|role (&|and) responsibilities|duties|day[- ]to[- ]day|in this role|your role|you will)\b/i },
  { context: 'mandatory', pattern: /^(requirements|qualifications|must[- ]haves?|what we'?re looking for|what you'?ll need|what you will need|what you bring|required (skills|qualifications)|basic qualifications|minimum qualifications|who you are|skills required|eligibility( criteria)?|skills|technical skills|you have|you should have|candidate profile)\b/i },
  { context: 'benefits', pattern: /^(benefits|perks|what we offer|compensation|why join us|salary)\b/i },
  { context: 'about', pattern: /^(about (us|the company|the role|the team|[A-Z][\w&.]+)|company overview|who we are|overview)\b/i },
];

const PREFERRED_CUE = /\b(nice to have|preferred|is a plus|a plus|bonus|good to have|desirable|would be (an advantage|great|nice)|advantage|optional|familiarity with|exposure to|ideally|not required)\b/i;
const MANDATORY_CUE = /\b(must|required|requirement|mandatory|strong|proficien\w*|solid|hands-on|minimum|essential|in-depth|expert)\b/i;
const ROLE_NOUNS = /\b(intern|engineer|developer|analyst|scientist|designer|architect|programmer|consultant|administrator|specialist|associate|manager|lead|sde|swe)\b/i;
const RESPONSIBILITY_VERBS = /^(build|develop|design|write|collaborate|maintain|implement|work|participate|own|deploy|optimi[sz]e|analy[sz]e|create|test|debug|integrate|support|contribute|ensure|troubleshoot|monitor|automate|translate|review|document|partner|drive|lead|manage|deliver|research|prepare|clean|train|evaluate|perform|assist)\b/i;

const isHeadingLine = (line: string) => {
  const clean = line.trim().replace(/[:\-–—]+$/, '').trim();
  if (clean.length === 0 || clean.length > 60 || isBulletLine(line)) return null;
  const match = JD_HEADINGS.find(({ pattern }) => pattern.test(clean));
  if (!match) return null;
  // Headings are short; long sentences that merely start with "Skills ..." are content.
  if (clean.split(/\s+/).length > 7 && !/:$/.test(line.trim())) return null;
  const inline = line.match(/^[^:]{3,40}:\s*(.+)$/);
  return { context: match.context, inlineContent: inline?.[1]?.trim() };
};

const extractRole = (lines: string[], text: string): { role: string; company?: string } => {
  const labelled = text.match(/^(?:job title|position|role|title|designation)\s*[:\-–]\s*(.+)$/im);
  if (labelled) return { role: labelled[1].trim(), company: text.match(/^company\s*[:\-–]\s*(.+)$/im)?.[1]?.trim() };

  const first = lines.find((line) => line.trim().length > 0)?.trim() ?? '';
  if (first && first.split(/\s+/).length <= 12 && ROLE_NOUNS.test(first)) {
    const [role, company] = first.split(/\s+(?:-|–|—|at|@|\|)\s+/);
    return { role: role.trim(), company: company?.trim() };
  }

  const hiring = text.match(/(?:hiring|seeking|looking for|recruiting)\s+(?:an?\s+|our next\s+)?((?:[A-Z][\w/+.#-]*\s+){0,4}?(?:Intern|Engineer|Developer|Analyst|Scientist|Designer|Architect|Programmer|Consultant|Specialist|Associate|SDE|SWE)\b(?:\s+Intern)?)/);
  if (hiring) return { role: hiring[1].trim() };

  const anyRole = text.match(/((?:[A-Z][\w/+.#-]*\s+){1,3}(?:Intern|Engineer|Developer|Analyst|Scientist|Designer))/);
  return { role: anyRole?.[1]?.trim() ?? 'Unspecified role' };
};

const extractSeniority = (role: string, text: string): StructuredJob['seniority'] => {
  const check = (value: string): StructuredJob['seniority'] | null => {
    if (/\bintern(ship)?\b/i.test(value)) return 'INTERN';
    if (/\b(principal|staff|lead|head of|tech lead)\b/i.test(value)) return 'LEAD';
    if (/\b(senior|sr\.?)\b/i.test(value)) return 'SENIOR';
    if (/\b(mid[- ]level|intermediate)\b/i.test(value)) return 'MID';
    if (/\b(junior|jr\.?)\b/i.test(value)) return 'JUNIOR';
    if (/\b(fresher|freshers|entry[- ]level|graduate|new grad|campus|trainee|0\s*[-–to]+\s*[12]\s*(years|yrs))\b/i.test(value)) return 'ENTRY';
    return null;
  };
  return check(role) ?? check(text) ?? 'UNSPECIFIED';
};

export const extractExperienceRequirement = (text: string): StructuredJob['experience'] => {
  if (/\bfreshers?\b|\bno (prior )?experience (is )?required\b/i.test(text) && !/\d+\s*\+?\s*(years|yrs)/i.test(text)) {
    return { minYears: 0, maxYears: 1, raw: 'Fresher' };
  }
  const range = text.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)/i);
  if (range) return { minYears: Number(range[1]), maxYears: Number(range[2]), raw: range[0] };
  const min = text.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs)(?:\s+of)?(?:\s+\w+){0,4}\s+experience|(?:minimum|at least)\s+(\d+)\s*(?:years|yrs)/i);
  if (min) return { minYears: Number(min[1] ?? min[2]), maxYears: null, raw: min[0] };
  return { minYears: null, maxYears: null };
};

const extractEducation = (lines: Array<{ text: string; context: JdContext }>): StructuredJob['education'] => {
  const educationLines = lines.filter(({ text }) => detectDegreeLevel(text) && /\b(degree|b\.?\s?tech|b\.?e|bachelor|master|m\.?\s?tech|mca|bca|b\.?sc|graduate|ph\.?d|diploma)\b/i.test(text));
  if (educationLines.length === 0) return { required: false, minLevel: null, fields: [] };
  const levels = educationLines.map(({ text }) => detectDegreeLevel(text)!).filter((level) => level !== 'SCHOOL');
  const minLevel = levels.length ? levels.reduce<DegreeLevel>((min, level) => (degreeLevelRank[level] < degreeLevelRank[min] ? level : min), levels[0]) : null;
  const fields = unique(educationLines.flatMap(({ text }) => [...text.matchAll(new RegExp(FIELD_PATTERN.source, 'gi'))].map((match) => match[0])));
  const required = educationLines.some(({ text, context }) => context !== 'preferred' && !PREFERRED_CUE.test(text));
  return { required, minLevel, fields, raw: educationLines[0].text };
};

const SKILL_WEIGHT = (category: string) => (category === 'soft' ? 0.5 : category === 'concept' ? 0.8 : 1);

export const extractJob = (rawText: string): StructuredJob => {
  const text = rawText.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  // Assign each line to a JD section context.
  let context: JdContext = 'none';
  const contextual: Array<{ text: string; context: JdContext; bullet: boolean }> = [];
  for (const line of lines) {
    const heading = isHeadingLine(line);
    if (heading) {
      context = heading.context;
      if (heading.inlineContent) contextual.push({ text: heading.inlineContent, context, bullet: false });
      continue;
    }
    contextual.push({ text: stripBullet(line), context, bullet: isBulletLine(line) });
  }

  const { role, company } = extractRole(lines, text);

  // Skill requirements with importance.
  const requirementMap = new Map<string, JobSkillRequirement>();
  const units = contextual
    .filter((unit) => unit.context !== 'benefits')
    .flatMap((unit) => unit.text.split(/(?<=[.;])\s+(?=[A-Z])/).map((sentence) => ({ ...unit, text: sentence })));

  for (const unit of units) {
    const mentions = findSkillMentions(unit.text);
    for (const mention of mentions) {
      const def = getSkill(mention.skillId)!;
      const before = unit.text.slice(0, mention.index);
      // Cue words apply to the clause the skill sits in ("..., and Redis is a plus").
      const clause = unit.text.slice(Math.max(0, before.lastIndexOf(';'), before.lastIndexOf('. ')));
      let importance: Importance;
      if (PREFERRED_CUE.test(clause) || unit.context === 'preferred') importance = 'PREFERRED';
      else if (unit.context === 'about') importance = MANDATORY_CUE.test(clause) ? 'MANDATORY' : 'PREFERRED';
      else importance = 'MANDATORY';

      const existing = requirementMap.get(mention.skillId);
      if (existing) {
        if (!existing.originalPhrases.includes(mention.matchedText)) existing.originalPhrases.push(mention.matchedText);
        if (unit.context === 'mandatory' && existing.importance === 'MANDATORY' && importance === 'MANDATORY') {
          // Prefer the wording used in the explicit requirements list.
          existing.originalPhrase = mention.matchedText;
          existing.sourceSentence = unit.text;
        }
        if (existing.importance === 'PREFERRED' && importance === 'MANDATORY') {
          existing.importance = 'MANDATORY';
          existing.originalPhrase = mention.matchedText;
          existing.sourceSentence = unit.text;
        }
        continue;
      }
      requirementMap.set(mention.skillId, {
        id: `req-${mention.skillId}`,
        kind: 'skill',
        originalPhrase: mention.matchedText,
        originalPhrases: [mention.matchedText],
        canonical: mention.skillId,
        canonicalName: def.name,
        importance,
        category: def.category,
        sourceSentence: unit.text,
        weight: SKILL_WEIGHT(def.category),
      });
    }
  }

  const requirements = [...requirementMap.values()];

  // Responsibilities: explicit section first, otherwise verb-led sentences outside requirement sections.
  let responsibilityTexts = contextual.filter((unit) => unit.context === 'responsibilities').map((unit) => unit.text);
  if (responsibilityTexts.length === 0) {
    responsibilityTexts = contextual
      .filter((unit) => unit.context !== 'mandatory' && unit.context !== 'preferred' && unit.context !== 'benefits')
      .flatMap((unit) => unit.text.split(/(?<=[.;])\s+/))
      .map((sentence) => sentence.replace(/^(you will|you'll|the candidate will|responsible for)\s+/i, '').trim())
      .filter((sentence) => RESPONSIBILITY_VERBS.test(sentence) && sentence.split(/\s+/).length >= 4);
  }
  const responsibilities: JobResponsibility[] = unique(responsibilityTexts)
    .filter((value) => value.split(/\s+/).length >= 3)
    .slice(0, 12)
    .map((value, index) => ({
      id: `resp-${index + 1}`,
      text: value,
      keywords: unique(contentStems(value)).filter((stemmed) => stemmed.length > 2),
      skills: unique(findSkillMentions(value).map((mention) => mention.skillId)),
    }));

  const lower = text.toLowerCase();
  const domainKeywords = unique([
    ...DOMAIN_KEYWORDS.filter((keyword) => new RegExp(`\\b${keyword.replace(/[-/]/g, '[- ]?')}\\b`, 'i').test(lower)),
    ...requirements.filter((req) => req.category === 'concept').map((req) => req.canonicalName.toLowerCase()),
  ]);

  return {
    role,
    company,
    seniority: extractSeniority(role, text),
    experience: extractExperienceRequirement(text),
    education: extractEducation(contextual),
    mandatorySkills: requirements.filter((req) => req.importance === 'MANDATORY'),
    preferredSkills: requirements.filter((req) => req.importance === 'PREFERRED'),
    responsibilities,
    tools: requirements.filter((req) => ['tool', 'devops', 'cloud', 'testing'].includes(req.category)).map((req) => req.canonicalName),
    domainKeywords,
    wordCount: tokenize(text).length,
  };
};
