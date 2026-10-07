import { expandImplied, findSkillIds, findSkillMentions, getSkill, skillName } from './skillOntology.js';
import type {
  DegreeLevel,
  DetectedSection,
  EducationEntry,
  EvidenceSource,
  EvidenceStrength,
  ResumeEntry,
  ResumeLink,
  ResumeSkill,
  SectionKey,
  SkillEvidence,
  StructuredResume,
} from './types.js';
import { DATE_RANGE, DATE_TOKEN, durationInMonths, isBulletLine, startsWithActionVerb, stripBullet, unique } from '../utils/text.js';

const HEADING_ALIASES: Record<Exclude<SectionKey, 'header'>, string[]> = {
  summary: ['summary', 'professional summary', 'profile', 'profile summary', 'career objective', 'objective', 'about me', 'about', 'career summary', 'professional profile'],
  education: ['education', 'academic background', 'academics', 'educational qualifications', 'academic qualifications', 'education and training', 'academic details', 'qualifications'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'technologies', 'tech stack', 'tools and technologies', 'tools & technologies', 'skills and tools', 'skills & tools', 'technical proficiency', 'competencies', 'core competencies', 'skill set', 'skillset', 'technical expertise', 'skills summary', 'skills & interests', 'skills and interests'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'relevant experience', 'industry experience', 'experience & internships', 'experience and internships'],
  internships: ['internships', 'internship', 'internship experience', 'industrial training', 'training', 'internships & training'],
  projects: ['projects', 'academic projects', 'personal projects', 'key projects', 'major projects', 'technical projects', 'project work', 'selected projects', 'projects & research', 'project experience', 'final year project'],
  certifications: ['certifications', 'certification', 'certificates', 'courses', 'licenses & certifications', 'licenses and certifications', 'online courses', 'certifications & courses', 'certifications and courses', 'relevant coursework', 'coursework'],
  achievements: ['achievements', 'awards', 'honors', 'honours', 'accomplishments', 'awards & achievements', 'awards and achievements', 'achievements & awards', 'honors & awards'],
  links: ['links', 'profiles', 'online profiles', 'social', 'social links', 'coding profiles'],
  activities: ['extracurricular activities', 'extra-curricular activities', 'extracurriculars', 'activities', 'positions of responsibility', 'leadership', 'volunteering', 'volunteer experience', 'leadership & activities', 'responsibilities'],
  publications: ['publications', 'research', 'research papers'],
  other: ['hobbies', 'interests', 'languages', 'declaration', 'personal details', 'references', 'personal information', 'additional information'],
};

const ALIAS_LOOKUP = new Map<string, SectionKey>();
Object.entries(HEADING_ALIASES).forEach(([key, aliases]) => aliases.forEach((alias) => ALIAS_LOOKUP.set(alias, key as SectionKey)));

const normalizeHeading = (line: string) =>
  line
    .trim()
    .replace(/^[#=*_\-\s|•]+|[#=*_\-\s|:•]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

export const classifyHeading = (line: string): { key: SectionKey; standard: boolean; inlineContent?: string } | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 60) return null;

  const inline = trimmed.match(/^([A-Za-z &/-]{3,40}):\s*(.+)$/);
  if (inline) {
    const key = ALIAS_LOOKUP.get(normalizeHeading(inline[1]));
    if (key) return { key, standard: true, inlineContent: inline[2].trim() };
  }

  const normalized = normalizeHeading(trimmed);
  const key = ALIAS_LOOKUP.get(normalized);
  if (key) return { key, standard: true };

  // ALL-CAPS short lines that are not a known heading are treated as non-standard section headings.
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  const words = normalized.split(' ').filter(Boolean);
  if (
    letters.length >= 4 &&
    letters === letters.toUpperCase() &&
    words.length <= 4 &&
    !/[\d|,@]/.test(trimmed) &&
    !findSkillIds(trimmed).length
  ) {
    const fuzzy = [...ALIAS_LOOKUP.entries()].find(([alias]) => normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`));
    if (fuzzy) return { key: fuzzy[1], standard: false };
    return { key: 'other', standard: false };
  }
  return null;
};

export const normalizeResumeText = (raw: string): string =>
  raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\t+/g, '  ')
    .replace(/[ ]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();

export const detectSections = (text: string): DetectedSection[] => {
  const lines = text.split('\n');
  const sections: DetectedSection[] = [{ key: 'header', heading: '', standardHeading: true, startLine: 0, lines: [] }];

  let seenFirstLine = false;
  lines.forEach((line, index) => {
    // The first non-empty line is almost always the candidate name, never a heading.
    const heading = seenFirstLine ? classifyHeading(line) : null;
    if (line.trim()) seenFirstLine = true;
    const current = sections[sections.length - 1];
    // "Languages: Java, Python" inside a Skills block is a sub-category, not a new section.
    const isSkillSubcategory = heading?.inlineContent !== undefined && current.key === 'skills';
    if (heading && !isSkillSubcategory) {
      sections.push({ key: heading.key, heading: line.trim().replace(/:.*$/, '').trim() || line.trim(), standardHeading: heading.standard, startLine: index, lines: heading.inlineContent ? [heading.inlineContent] : [] });
      return;
    }
    sections[sections.length - 1].lines.push(line);
  });

  return sections.map((section) => ({ ...section, lines: section.lines.filter((line) => line.trim().length > 0) }));
};

const ROLE_WORDS = /\b(intern|internship|engineer|developer|analyst|assistant|trainee|scientist|designer|consultant|associate|lead|manager|architect|programmer|researcher|apprentice|fellow|volunteer|member|head|coordinator|tutor|teaching)\b/i;
const TECH_LINE = /^(tech(nologies|nology| stack)?|stack|tools( used)?|built with|skills used|environment)\s*[:\-–]/i;
const URL_PATTERN = /\b((?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/[\w\-/%]+|github\.com\/[\w\-./]+|leetcode\.com\/[\w\-/]+|[\w-]+\.(?:vercel\.app|netlify\.app|github\.io|dev|me|io|tech|in|com)(?:\/[\w\-./]*)?))/gi;

const isTitleLike = (line: string) => {
  const clean = line.trim();
  if (DATE_RANGE.test(clean)) return true;
  if (/\s[|–—]\s/.test(clean)) return true;
  const words = clean.split(/\s+/);
  return words.length <= 9 && /^[A-Z0-9]/.test(clean) && !/[.;]$/.test(clean) && !startsWithActionVerb(clean);
};

const parseTitleLine = (line: string): { title: string; organization?: string; dates?: string } => {
  const dateMatch = line.match(DATE_RANGE);
  let dates = dateMatch?.[0];
  let rest = dateMatch ? line.replace(dateMatch[0], ' ') : line;
  if (!dates) {
    const single = rest.match(DATE_TOKEN);
    if (single && /\b(19|20)\d{2}\b/.test(single[0])) {
      dates = single[0];
      rest = rest.replace(single[0], ' ');
    }
  }
  const parts = rest
    .split(/\s[|–—]\s|\s-\s|\s@\s|\sat\s|,\s|\s{2,}|\|/)
    .map((part) => part.replace(/[()]/g, '').trim())
    .filter((part) => part.length > 1);
  if (parts.length === 0) return { title: line.trim(), dates };
  const roleIndex = parts.findIndex((part) => ROLE_WORDS.test(part));
  if (roleIndex > 0) {
    const [role] = parts.splice(roleIndex, 1);
    return { title: role, organization: parts[0], dates };
  }
  return { title: parts[0], organization: parts[1], dates };
};

const newEntry = (titleLine: string): ResumeEntry => {
  const parsed = parseTitleLine(titleLine);
  return { title: parsed.title, organization: parsed.organization, dates: parsed.dates, durationMonths: parsed.dates ? durationInMonths(parsed.dates) : null, bullets: [], rawLines: [titleLine], technologies: [], links: [] };
};

/** Splits an experience/projects/internships section into entries, repairing PDF line wrapping. */
export const splitEntries = (lines: string[]): ResumeEntry[] => {
  const entries: ResumeEntry[] = [];

  // "Projects: A (React, Node), B (MongoDB)" style single line lists.
  if (lines.length === 1 && /\),\s*[A-Z]/.test(lines[0])) {
    return lines[0]
      .split(/(?<=\))\s*,\s*/)
      .map((item) => {
        const entry = newEntry(item.replace(/\s*\(.*$/, '').trim());
        entry.rawLines = [item.trim()];
        entry.technologies = findSkillIds(item);
        return entry;
      });
  }

  let current: ResumeEntry | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isBulletLine(line)) {
      if (!current) {
        current = newEntry('Untitled entry');
        current.rawLines = [];
        entries.push(current);
      }
      current.bullets.push(stripBullet(line));
      current.rawLines.push(line);
      continue;
    }

    if (current && current.bullets.length === 0) {
      // Still inside the entry header block (organisation, dates, tech stack, description).
      current.rawLines.push(line);
      if (!current.dates) {
        const dateMatch = line.match(DATE_RANGE);
        if (dateMatch) {
          current.dates = dateMatch[0];
          current.durationMonths = durationInMonths(dateMatch[0]);
        }
      }
      if (!current.organization && !TECH_LINE.test(line) && line.split(/\s+/).length <= 8 && !/[.]$/.test(line)) {
        const parsed = parseTitleLine(line);
        if (parsed.title && parsed.title !== current.title) current.organization = parsed.title;
      }
      if (line.split(/\s+/).length > 9 && !TECH_LINE.test(line)) current.bullets.push(line);
      continue;
    }

    if (current && current.bullets.length > 0) {
      const continuation = /^[a-z(&,]/.test(line) || (!isTitleLike(line) && !TECH_LINE.test(line));
      if (continuation && !TECH_LINE.test(line)) {
        current.bullets[current.bullets.length - 1] = `${current.bullets[current.bullets.length - 1]} ${line}`.trim();
        current.rawLines.push(line);
        continue;
      }
      if (TECH_LINE.test(line)) {
        current.rawLines.push(line);
        continue;
      }
    }

    current = newEntry(line);
    entries.push(current);
  }

  return entries.map((entry) => {
    const allText = entry.rawLines.join('\n');
    return {
      ...entry,
      technologies: findSkillIds(allText),
      links: unique([...allText.matchAll(URL_PATTERN)].map((match) => match[1]).filter((url) => /https?:|www./i.test(url) || !/[A-Z]/.test(url.split('/')[0]))),
    };
  });
};

const DEGREE_PATTERNS: Array<{ level: DegreeLevel; pattern: RegExp }> = [
  { level: 'DOCTORATE', pattern: /\b(ph\.?\s?d|doctorate)\b/i },
  { level: 'MASTER', pattern: /\b(m\.?\s?tech|m\.?e\.|m\.?sc|mca|mba|master'?s?|m\.?s\.?\s+in|pgdm|post\s?graduate)\b/i },
  { level: 'BACHELOR', pattern: /\b(b\.?\s?tech|b\.?e\.?(?=\s|,|$)|b\.?sc|bca|bba|b\.?com|bachelor'?s?|b\.?s\.?\s+in|b\.?a\.?\s+in|undergraduate|be\s+in)\b/i },
  { level: 'DIPLOMA', pattern: /\b(diploma|polytechnic)\b/i },
  { level: 'SCHOOL', pattern: /\b(12th|10th|xii|class\s?x|hsc|ssc|senior secondary|higher secondary|cbse|icse|intermediate|matriculation|high school)\b/i },
];

export const FIELD_PATTERN = /\b(computer science(?: (?:and|&) engineering)?|cse|information technology|it\b|electronics(?: and communication)?|ece|electrical(?: engineering)?|mechanical(?: engineering)?|civil(?: engineering)?|data science|artificial intelligence|ai(?:\s?&\s?|\s+and\s+)ml|mathematics|statistics|physics|software engineering|computer applications|information science)\b/i;
const INSTITUTION_PATTERN = /([A-Z][\w.&'-]*(?:\s+[A-Z(][\w.&'()-]*)*\s+(?:University|Institute|College|School|Academy|Vidyalaya|Vidyapeeth)(?:\s+of\s+[A-Z][\w.&'-]*(?:\s+[A-Z][\w.&'-]*)*)?|\b(?:IIT|NIT|IIIT|BITS|VIT|IIM)\b[\w\s,-]{0,30})/;

export const degreeLevelRank: Record<DegreeLevel, number> = { SCHOOL: 0, DIPLOMA: 1, BACHELOR: 2, MASTER: 3, DOCTORATE: 4 };

export const detectDegreeLevel = (text: string): DegreeLevel | undefined => DEGREE_PATTERNS.find(({ pattern }) => pattern.test(text))?.level;

export const parseEducation = (lines: string[]): EducationEntry[] => {
  const entries: EducationEntry[] = [];
  let current: EducationEntry | null = null;

  for (const raw of lines) {
    const line = stripBullet(raw);
    const level = detectDegreeLevel(line);
    const institution = line.match(INSTITUTION_PATTERN)?.[0]?.trim();
    const startsNew = !current || (level && current.degree) || (institution && current.institution && !level);
    if (startsNew) {
      current = { raw: line };
      entries.push(current);
    } else if (current) {
      current.raw = `${current.raw}\n${line}`;
    }
    if (!current) continue;
    if (level && !current.degree) {
      current.degreeLevel = level;
      current.degree = line.match(DEGREE_PATTERNS.find((d) => d.level === level)!.pattern)?.[0];
    }
    if (!current.field) current.field = line.match(FIELD_PATTERN)?.[0];
    if (!current.institution && institution) current.institution = institution;
    if (!current.year) current.year = line.match(DATE_RANGE)?.[0] ?? line.match(/\b(19|20)\d{2}\b/)?.[0];
    if (!current.score) current.score = line.match(/\b(?:cgpa|gpa|sgpa|cpi)\s*[:-]?\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|\b\d+(?:\.\d+)?\s*(?:cgpa|gpa)|\b\d{2}(?:\.\d+)?\s?%/i)?.[0];
  }
  return entries;
};

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_PATTERN = /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5}/g;

const extractLinks = (text: string): ResumeLink[] => {
  const urls = unique([...text.matchAll(URL_PATTERN)].map((match) => match[1].replace(/[.,;)]+$/, '')));
  return urls
    .filter((url) => !EMAIL_PATTERN.test(url) && !/@/.test(url))
    .filter((url) => /https?:|www./i.test(url) || !/[A-Z]/.test(url.split('/')[0]))
    .filter((url) => /linkedin|github|leetcode|vercel|netlify|https?:\/\/|www\./i.test(url) || /\.(dev|me|io|tech)\b/i.test(url))
    .map((url) => ({
      url,
      type: /linkedin/i.test(url) ? 'linkedin' : /github\.com/i.test(url) ? 'github' : /leetcode/i.test(url) ? 'leetcode' : /vercel|netlify|github\.io|\.(dev|me|io|tech)\b/i.test(url) ? 'portfolio' : 'other',
    }));
};

const extractCandidate = (headerLines: string[], fullText: string) => {
  const email = fullText.match(EMAIL_PATTERN)?.[0];
  const phone = [...fullText.matchAll(PHONE_PATTERN)].map((match) => match[0].trim()).find((value) => value.replace(/\D/g, '').length >= 10 && value.replace(/\D/g, '').length <= 13);
  const nameLine = headerLines.find((line) => {
    const clean = line.trim();
    return /^[A-Za-z][A-Za-z.' -]{2,40}$/.test(clean) && clean.split(/\s+/).length >= 2 && clean.split(/\s+/).length <= 4 && !classifyHeading(clean)?.standard && !findSkillIds(clean).length;
  });
  const headline = headerLines.find((line) => line !== nameLine && ROLE_WORDS.test(line) && !EMAIL_PATTERN.test(line) && line.length < 120);
  const location = headerLines
    .flatMap((line) => line.split(/[|•·]/))
    .map((part) => part.trim())
    .find((part) => /^[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?,\s?[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?$/.test(part));
  return { name: nameLine?.trim(), email, phone, location, headline: headline?.trim() };
};

const FINAL_YEAR_PROJECT = /final[- ]year project|capstone|major project|b\.?\s?tech project|final semester project|\bfyp\b/i;

const SECTION_SOURCE: Record<SectionKey, EvidenceSource> = {
  header: 'summary',
  summary: 'summary',
  education: 'education',
  skills: 'skills',
  experience: 'experience',
  internships: 'internship',
  projects: 'project',
  certifications: 'certification',
  achievements: 'achievement',
  links: 'other',
  activities: 'achievement',
  publications: 'achievement',
  other: 'other',
};

const CONTEXTUAL: EvidenceSource[] = ['project', 'experience', 'internship'];

/** Evidence strength rules (documented for viva / report):
 * HIGH   - used in a descriptive bullet (action verb or >= 8 words) of a project/experience/internship,
 *          or evidenced in two or more distinct project/experience/internship entries.
 * MEDIUM - appears in a project/experience/internship (e.g. tech-stack line), certification or achievement.
 * LOW    - only listed in Skills / Summary / Education / other sections.
 */
export const gradeEvidence = (evidence: SkillEvidence[]): EvidenceStrength => {
  const contextual = evidence.filter((item) => CONTEXTUAL.includes(item.source));
  const descriptive = contextual.filter((item) => !TECH_LINE.test(item.text) && (startsWithActionVerb(item.text) || item.text.split(/\s+/).length >= 8));
  const distinctEntries = new Set(contextual.map((item) => `${item.source}:${item.entryTitle ?? ''}`));
  if (descriptive.length > 0 || distinctEntries.size >= 2) return 'HIGH';
  if (contextual.length > 0 || evidence.some((item) => item.source === 'certification' || item.source === 'achievement')) return 'MEDIUM';
  return 'LOW';
};

const STRENGTH_RANK: Record<EvidenceStrength, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export const structureResume = (rawText: string): StructuredResume => {
  const text = normalizeResumeText(rawText);
  const sections = detectSections(text);
  const byKey = (key: SectionKey) => sections.filter((section) => section.key === key);
  const linesOf = (key: SectionKey) => byKey(key).flatMap((section) => section.lines);

  const header = byKey('header')[0]?.lines ?? [];
  const experienceEntries = splitEntries(linesOf('experience'));
  const internshipEntries = [
    ...splitEntries(linesOf('internships')),
    ...experienceEntries.filter((entry) => /\b(intern|internship|trainee|apprentice)\b/i.test(`${entry.title} ${entry.organization ?? ''}`)),
  ];
  const experience = experienceEntries.filter((entry) => !internshipEntries.includes(entry));
  const projects = byKey('projects').flatMap((section) =>
    splitEntries(section.lines).map((entry) => ({ ...entry, isFinalYearProject: FINAL_YEAR_PROJECT.test(section.heading) || FINAL_YEAR_PROJECT.test(entry.rawLines.join(' ')) })),
  );

  // Collect skill evidence per textual unit.
  const evidenceMap = new Map<string, SkillEvidence[]>();
  const addEvidence = (unit: string, source: EvidenceSource, entryTitle?: string) => {
    const clean = stripBullet(unit).trim();
    if (!clean) return;
    // Profile URLs (github.com/...) are contact details, not skill claims.
    for (const mention of findSkillMentions(clean.replace(URL_PATTERN, ' '))) {
      const list = evidenceMap.get(mention.skillId) ?? [];
      if (!list.some((item) => item.text === clean && item.source === source)) list.push({ text: clean, source, entryTitle });
      evidenceMap.set(mention.skillId, list);
    }
  };

  const addEntries = (entries: ResumeEntry[], source: EvidenceSource) =>
    entries.forEach((entry) => {
      const bulletSet = new Set(entry.bullets);
      entry.rawLines.forEach((line) => {
        const stripped = stripBullet(line);
        if (!bulletSet.has(stripped)) addEvidence(line, source, entry.title);
      });
      entry.bullets.forEach((bullet) => addEvidence(bullet, source, entry.title));
    });

  addEntries(experience, 'experience');
  addEntries(internshipEntries, 'internship');
  addEntries(projects, 'project');
  sections
    .filter((section) => !['experience', 'internships', 'projects'].includes(section.key))
    .forEach((section) => section.lines.forEach((line) => addEvidence(line, SECTION_SOURCE[section.key])));

  const directSkills: ResumeSkill[] = [...evidenceMap.entries()].map(([id, evidence]) => {
    const def = getSkill(id)!;
    return { id, skill: def.name, category: def.category, evidence, evidenceStrength: gradeEvidence(evidence) };
  });

  const directIds = new Set(directSkills.map((skill) => skill.id));
  const implied = expandImplied(directIds);
  const impliedSkills: ResumeSkill[] = [];
  implied.forEach((via, id) => {
    if (directIds.has(id)) {
      const target = directSkills.find((skill) => skill.id === id)!;
      const source = directSkills.find((skill) => skill.id === via);
      if (source && STRENGTH_RANK[source.evidenceStrength] > STRENGTH_RANK[target.evidenceStrength]) {
        target.evidenceStrength = source.evidenceStrength;
        target.inferredFrom = source.id;
        target.evidence = [...target.evidence, ...source.evidence.slice(0, 2)];
      }
      return;
    }
    const source = directSkills.find((skill) => skill.id === via);
    const def = getSkill(id);
    if (!source || !def) return;
    impliedSkills.push({ id, skill: def.name, category: def.category, evidence: source.evidence.slice(0, 3), evidenceStrength: source.evidenceStrength, inferredFrom: via });
  });

  const skillsSectionText = linesOf('skills').join('\n');
  const skillsSectionItems = unique(
    skillsSectionText
      .split(/[\n,|•;]+/)
      .map((item) => item.replace(/^[^:]{2,30}:\s*/, '').trim())
      .filter((item) => item.length > 0 && item.length < 40),
  );

  const courseworkSections = byKey('certifications').filter((section) => /coursework/i.test(section.heading));
  const certifications = byKey('certifications')
    .filter((section) => !courseworkSections.includes(section))
    .flatMap((section) => section.lines)
    .map(stripBullet)
    .filter((line) => !/^(relevant\s+)?coursework\s*:/i.test(line));
  const achievements = [...linesOf('achievements'), ...linesOf('activities'), ...linesOf('publications')].map(stripBullet);
  const allLines = text.split('\n');
  const bulletCount = allLines.filter(isBulletLine).length;
  const summaryLines = linesOf('summary');

  const sumMonths = (entries: ResumeEntry[]) => entries.reduce((total, entry) => total + (entry.durationMonths ?? 0), 0);
  const education = parseEducation(linesOf('education'));
  const links = extractLinks(text);
  const contentLines = allLines.map((line) => stripBullet(line).trim()).filter(Boolean);
  const matching = (pattern: RegExp) => unique(contentLines.filter((line) => pattern.test(line))).slice(0, 6);
  const coursework = unique([
    ...courseworkSections.flatMap((section) => section.lines),
    ...contentLines.filter((line) => /^(relevant\s+)?coursework\s*:/i.test(line)).map((line) => line.replace(/^[^:]*:/, '')),
  ].flatMap((line) => stripBullet(line).split(/[,;|]/)).map((item) => item.trim()).filter((item) => item.length > 1 && item.length < 60));
  const graduationYear = education.map((entry) => entry.year?.match(/(19|20)\d{2}(?!.*(19|20)\d{2})/)?.[0]).find(Boolean);
  const totalExperienceMonths = sumMonths(experience);

  return {
    candidate: extractCandidate(header, text),
    summary: summaryLines.length ? summaryLines.join(' ') : undefined,
    education,
    skills: [...directSkills, ...impliedSkills].sort((a, b) => STRENGTH_RANK[b.evidenceStrength] - STRENGTH_RANK[a.evidenceStrength] || a.skill.localeCompare(b.skill)),
    skillsSectionItems,
    experience,
    internships: internshipEntries,
    projects,
    certifications,
    achievements,
    links,
    sections: sections.filter((section) => section.key !== 'header' || section.lines.length).map((section) => ({ key: section.key, heading: section.heading, standardHeading: section.standardHeading, lineCount: section.lines.length })),
    stats: {
      wordCount: text.split(/\s+/).filter(Boolean).length,
      lineCount: allLines.length,
      bulletCount,
      totalExperienceMonths,
      internshipMonths: sumMonths(internshipEntries),
    },
    studentSignals: {
      isStudentOrFresher: totalExperienceMonths < 12,
      finalYearProjects: projects.filter((project) => project.isFinalYearProject).map((project) => project.title),
      academicProjects: projects.length,
      hackathons: matching(/hackathon|ideathon|codeathon|\bSIH\b|smart india hackathon/i),
      competitiveProgramming: matching(/leetcode|codeforces|codechef|hackerrank|atcoder|\bicpc\b|competitive programming/i),
      openSource: matching(/open[- ]source|hacktoberfest|\bgsoc\b|google summer of code|\bpull requests?\b|\bmerged prs?\b/i),
      coursework,
      certifications: certifications.length,
      githubLinked: links.some((link) => link.type === 'github'),
      graduationYear,
    },
  };
};

export const resumeSkillMap = (resume: StructuredResume) => new Map(resume.skills.map((skill) => [skill.id, skill]));

export const describeSkill = (id: string) => skillName(id);
