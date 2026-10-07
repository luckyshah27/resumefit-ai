export const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s+.#/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'into', 'this', 'your', 'have', 'been', 'will', 'their', 'what', 'are', 'was',
  'were', 'our', 'you', 'who', 'all', 'any', 'can', 'has', 'had', 'its', 'not', 'but', 'out', 'use', 'using', 'used', 'also',
  'able', 'such', 'other', 'more', 'most', 'than', 'then', 'them', 'they', 'which', 'while', 'where', 'when', 'well', 'work',
  'working', 'strong', 'good', 'great', 'ability', 'skills', 'skill', 'knowledge', 'experience', 'experienced', 'understanding',
  'including', 'etc', 'like', 'within', 'across', 'over', 'per', 'via', 'about', 'should', 'must', 'would', 'could', 'may',
  'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'or', 'as', 'is', 'be', 'it', 'we', 'us', 'if', 'so', 'do', 'new', 'least',
  'year', 'years', 'plus', 'preferred', 'required', 'requirements', 'nice', 'have', 'role', 'team', 'candidate', 'candidates',
  'looking', 'join', 'help', 'related', 'relevant', 'various', 'familiarity', 'familiar', 'exposure', 'basic', 'solid', 'hands',
]);

export const extractKeywords = (value: string): string[] => {
  const normalized = normalizeText(value);
  return normalized.split(' ').filter((term) => term.length > 2 && !STOPWORDS.has(term));
};

export const safeNumber = (value: number | undefined, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
};

/** Small, deterministic suffix-stripping stemmer (sufficient for keyword overlap, not linguistics). */
export const stem = (word: string): string => {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  const rules: Array<[RegExp, string]> = [
    [/ies$/, 'y'],
    [/ization$/, 'ize'],
    [/isation$/, 'ize'],
    [/ational$/, 'ate'],
    [/ments?$/, ''],
    [/ings?$/, ''],
    [/ed$/, ''],
    [/ers?$/, ''],
    [/ly$/, ''],
    [/es$/, ''],
    [/s$/, ''],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(w) && w.replace(pattern, replacement).length >= 3) {
      w = w.replace(pattern, replacement);
      break;
    }
  }
  return w.replace(/e$/, '');
};

export const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/[\s/]+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((token) => token.length > 1);

export const contentStems = (value: string): string[] =>
  tokenize(value)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token))
    .map(stem);

export const splitSentences = (value: string): string[] =>
  value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9•\-*])|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

export const BULLET_PATTERN = /^\s*(?:[•●▪◦‣∙·○■□➢➤►▶✓✔\-–—*]|\d{1,2}[.)])\s+/;

export const stripBullet = (line: string): string => line.replace(BULLET_PATTERN, '').trim();

export const isBulletLine = (line: string): boolean => BULLET_PATTERN.test(line);

export const STRONG_ACTION_VERBS = [
  'achieved', 'architected', 'automated', 'built', 'created', 'delivered', 'deployed', 'designed', 'developed', 'engineered',
  'implemented', 'improved', 'increased', 'integrated', 'launched', 'led', 'migrated', 'optimized', 'optimised', 'reduced',
  'refactored', 'scaled', 'shipped', 'streamlined', 'trained', 'analyzed', 'analysed', 'established', 'accelerated', 'configured',
  'containerized', 'debugged', 'documented', 'enhanced', 'evaluated', 'modeled', 'modelled', 'orchestrated', 'owned', 'piloted',
  'programmed', 'published', 'redesigned', 'resolved', 'spearheaded', 'tested', 'wrote', 'coordinated', 'mentored', 'organized',
  'organised', 'researched', 'visualized', 'visualised', 'fine-tuned', 'benchmarked', 'secured', 'cut', 'boosted', 'collaborated',
  'contributed', 'conducted', 'performed', 'prototyped', 'maintained', 'monitored', 'authored', 'presented', 'won', 'ranked',
  'created', 'crafted', 'translated', 'generated', 'predicted', 'classified', 'cleaned', 'processed', 'extracted', 'supported',
];

export const WEAK_PHRASES: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /^responsible for (developing|building|creating|designing|implementing|maintaining|testing|writing|managing)\b/i, replacement: '$verb', label: 'Responsible for ...ing' },
  { pattern: /^worked on (building|developing|creating|designing|implementing)\b/i, replacement: '$verb', label: 'Worked on ...ing' },
  { pattern: /^worked on\b/i, replacement: 'Contributed to', label: 'Worked on' },
  { pattern: /^was involved in\b/i, replacement: 'Contributed to', label: 'Was involved in' },
  { pattern: /^involved in\b/i, replacement: 'Contributed to', label: 'Involved in' },
  { pattern: /^helped (to )?(build|develop|create|design|implement)\b/i, replacement: 'Contributed to $gerund', label: 'Helped build' },
  { pattern: /^helped (with )?/i, replacement: 'Supported ', label: 'Helped' },
  { pattern: /^assisted (in|with)\b/i, replacement: 'Supported', label: 'Assisted with' },
  { pattern: /^participated in\b/i, replacement: 'Took part in', label: 'Participated in' },
  { pattern: /^made\b/i, replacement: 'Created', label: 'Made' },
  { pattern: /^did\b/i, replacement: 'Performed', label: 'Did' },
  { pattern: /^handled\b/i, replacement: 'Managed', label: 'Handled' },
  { pattern: /^tasked with (developing|building|creating|designing|implementing)\b/i, replacement: '$verb', label: 'Tasked with ...ing' },
];

const GERUND_TO_PAST: Record<string, string> = {
  developing: 'Developed',
  building: 'Built',
  creating: 'Created',
  designing: 'Designed',
  implementing: 'Implemented',
  maintaining: 'Maintained',
  testing: 'Tested',
  writing: 'Wrote',
  managing: 'Managed',
};

const BASE_TO_GERUND: Record<string, string> = {
  build: 'building',
  develop: 'developing',
  create: 'creating',
  design: 'designing',
  implement: 'implementing',
};

/** Rewrites a weak opening phrase without adding any new facts. Returns null when no rule applies. */
export const strengthenOpening = (bullet: string): { text: string; rule: string } | null => {
  for (const rule of WEAK_PHRASES) {
    const match = bullet.match(rule.pattern);
    if (!match) continue;
    let replacement = rule.replacement;
    if (replacement === '$verb') {
      const gerund = match[1].toLowerCase();
      replacement = GERUND_TO_PAST[gerund] ?? 'Developed';
    } else if (replacement.includes('$gerund')) {
      replacement = replacement.replace('$gerund', BASE_TO_GERUND[match[2].toLowerCase()] ?? 'building');
    }
    const rest = bullet.slice(match[0].length).replace(/^\s+/, '');
    const text = `${replacement.trimEnd()}${rest ? ` ${rest}` : ''}`.replace(/\s+/g, ' ').trim();
    return { text, rule: rule.label };
  }
  return null;
};

export const startsWithActionVerb = (bullet: string): boolean => {
  const first = tokenize(bullet)[0] ?? '';
  return STRONG_ACTION_VERBS.includes(first);
};

export const METRIC_PATTERN = /(\d+(?:\.\d+)?\s?(%|percent|x\b|ms\b|s\b|sec|seconds|minutes|hours|k\b|K\b|M\b|users|requests|rps|qps|downloads|stars|customers|clients|records|rows|pages|teams?|members|students|participants)|\b\d{2,}[+]?\s|\$\s?\d+|₹\s?\d+|\btop\s\d+|\brank(ed)?\s\d+|\b\d+(?:\.\d+)?\s?(lpa|cgpa|gpa)\b)/i;

export const hasMetric = (value: string): boolean => METRIC_PATTERN.test(value);

export const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

export const DATE_TOKEN = new RegExp(`(?:(?:${MONTHS})\\.?\\s*'?\\d{2,4}|\\d{1,2}/\\d{4}|\\d{4}-\\d{2}|\\b(?:19|20)\\d{2}\\b)`, 'i');

export const DATE_RANGE = new RegExp(
  `((?:(?:${MONTHS})\\.?\\s*'?\\d{2,4})|\\d{1,2}/\\d{4}|\\d{4}-\\d{2}|(?:19|20)\\d{2})\\s*(?:-|–|—|to|till|until)\\s*((?:(?:${MONTHS})\\.?\\s*'?\\d{2,4})|\\d{1,2}/\\d{4}|\\d{4}-\\d{2}|(?:19|20)\\d{2}|present|current|now|ongoing|date)`,
  'i',
);

const MONTH_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Parses a single date token to months-since-epoch-year-0 (year*12+month). */
export const parseDateToken = (token: string, now = new Date()): number | null => {
  const value = token.trim().toLowerCase();
  if (/present|current|now|ongoing|date/.test(value)) return now.getFullYear() * 12 + now.getMonth();
  const monthYear = value.match(new RegExp(`(${MONTHS})\\.?\\s*'?(\\d{2,4})`, 'i'));
  if (monthYear) {
    const month = MONTH_INDEX[monthYear[1].slice(0, 3).toLowerCase()];
    let year = Number(monthYear[2]);
    if (year < 100) year += 2000;
    return year * 12 + month;
  }
  const slash = value.match(/(\d{1,2})\/(\d{4})/);
  if (slash) return Number(slash[2]) * 12 + Number(slash[1]) - 1;
  const iso = value.match(/(\d{4})-(\d{2})/);
  if (iso) return Number(iso[1]) * 12 + Number(iso[2]) - 1;
  const year = value.match(/(19|20)\d{2}/);
  if (year) return Number(year[0]) * 12;
  return null;
};

/** Duration in months of the first date range in `value`, or null. */
export const durationInMonths = (value: string, now = new Date()): number | null => {
  const match = value.match(DATE_RANGE);
  if (!match) return null;
  const start = parseDateToken(match[1], now);
  const end = parseDateToken(match[2], now);
  if (start === null || end === null || end < start) return null;
  return Math.max(1, end - start + (/(19|20)\d{2}$/.test(match[2].trim()) && !/[a-z]/i.test(match[2]) ? 0 : 1));
};

export const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const round1 = (value: number) => Math.round(value * 10) / 10;

export const unique = <T>(values: T[]): T[] => [...new Set(values)];

export const jaccard = (a: Iterable<string>, b: Iterable<string>) => {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  setA.forEach((value) => {
    if (setB.has(value)) intersection += 1;
  });
  return intersection / (setA.size + setB.size - intersection);
};
