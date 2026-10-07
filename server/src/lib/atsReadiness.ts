import { findSkillMentions } from './skillOntology.js';
import type { CheckStatus, ExtractionMeta, PointLoss, ScoreComponent, StructuredJob, StructuredResume } from './types.js';
import { DATE_RANGE, round1 } from '../utils/text.js';

export type AtsIssue = { checkId: string; severity: 'high' | 'medium' | 'low'; message: string };

export type AtsResult = {
  score: number;
  checks: ScoreComponent[];
  issues: AtsIssue[];
  evidence: string[];
  pointLosses: PointLoss[];
  disclaimer: string;
};

export const ATS_DISCLAIMER =
  'ATS Readiness is a best-effort estimate of how reliably common applicant tracking systems can parse this resume. Real ATS products differ; these are potential risks, not guarantees.';

const statusOf = (ratio: number): CheckStatus => (ratio >= 0.85 ? 'pass' : ratio >= 0.5 ? 'warn' : 'fail');

type CheckDraft = { id: string; label: string; weight: number; ratio: number; rule: string; evidence: string[]; issues?: AtsIssue[]; applicable?: boolean };

/** Signals that text was extracted in a malformed way (fused words, letter-spaced headings). */
export const detectMalformedExtraction = (text: string) => {
  const fusedWords = text.split(/\s+/).filter((token) => token.length > 28 && /^[A-Za-z]+$/.test(token));
  const spacedLetters = text.split('\n').filter((line) => /(?:\b[A-Za-z]\s){5,}[A-Za-z]\b/.test(line.trim()));
  return { fusedWords, spacedLetters };
};

export const scoreAtsReadiness = (resume: StructuredResume, rawText: string, meta: ExtractionMeta, job?: StructuredJob): AtsResult => {
  const drafts: CheckDraft[] = [];
  const has = (key: string) => resume.sections.some((section) => section.key === key);

  // 1. Extractability
  {
    const issues: AtsIssue[] = [];
    let ratio = 1;
    if (meta.charCount < 200) {
      ratio = 0;
      issues.push({ checkId: 'extractability', severity: 'high', message: 'Potential parsing risk: almost no text could be extracted. The file may be image-only (scanned) — ATS software usually cannot read images.' });
    } else if (meta.fileType === 'pdf' && meta.textPerPage !== undefined && meta.textPerPage < 400) {
      ratio = 0.5;
      issues.push({ checkId: 'extractability', severity: 'medium', message: `Potential parsing risk: only ~${Math.round(meta.textPerPage)} characters per page were extractable. Some content may be inside images or graphics.` });
    }
    if (meta.unusualCharRatio > 0.02) {
      ratio = Math.max(0, ratio - 0.3);
      issues.push({ checkId: 'extractability', severity: 'medium', message: `Potential parsing risk: ${(meta.unusualCharRatio * 100).toFixed(1)}% of characters are unusual symbols or icon-font glyphs that may be garbled.` });
    }
    // Malformed extraction (since 2.1.0): words fused together or headings spelled with spaced letters.
    const malformed = detectMalformedExtraction(rawText);
    if (malformed.fusedWords.length >= 5) {
      ratio = Math.max(0, ratio - 0.2);
      issues.push({ checkId: 'extractability', severity: 'medium', message: `Potential parsing risk: ${malformed.fusedWords.length} run-together words were extracted (e.g. “${malformed.fusedWords[0].slice(0, 32)}”). Spacing may be lost when this file is parsed.` });
    }
    if (malformed.spacedLetters.length >= 2) {
      ratio = Math.max(0, ratio - 0.2);
      issues.push({ checkId: 'extractability', severity: 'medium', message: `Potential parsing risk: ${malformed.spacedLetters.length} line(s) use letter-spaced text (e.g. “${malformed.spacedLetters[0].slice(0, 32)}”), which parsers read as single letters.` });
    }
    drafts.push({ id: 'extractability', label: 'Text extractability', weight: 20, ratio, rule: 'Text must be selectable (not image-only), free of icon-font glyphs, and extract with normal word spacing.', evidence: [`${meta.charCount} characters extracted from ${meta.fileType.toUpperCase()}${meta.pageCount ? ` (${meta.pageCount} page${meta.pageCount > 1 ? 's' : ''})` : ''}`], issues });
  }

  // 2. Standard headings
  {
    const core = [
      { key: 'education', label: 'Education' },
      { key: 'skills', label: 'Skills' },
      { key: 'experience|internships|projects', label: 'Experience / Internships / Projects' },
    ];
    const present = core.filter((item) => item.key.split('|').some(has));
    const nonStandard = resume.sections.filter((section) => !section.standardHeading);
    const ratio = Math.max(0, present.length / core.length - nonStandard.length * 0.1);
    const issues: AtsIssue[] = [
      ...core.filter((item) => !present.includes(item)).map((item) => ({ checkId: 'headings', severity: 'high' as const, message: `Potential parsing risk: no recognisable “${item.label}” heading was found.` })),
      ...nonStandard.map((section) => ({ checkId: 'headings', severity: 'low' as const, message: `Potential parsing risk: the heading “${section.heading}” is non-standard; ATS parsers may not map it to a known section.` })),
    ];
    drafts.push({ id: 'headings', label: 'Standard section headings', weight: 12, ratio, rule: 'Use conventional headings (Education, Skills, Experience, Projects).', evidence: resume.sections.filter((s) => s.key !== 'header').map((section) => `${section.heading} → ${section.key}`), issues });
  }

  // 3. Contact info
  {
    const { email, phone } = resume.candidate;
    const profile = resume.links.find((link) => link.type === 'linkedin' || link.type === 'github');
    const ratio = (email ? 5 : 0) / 12 + (phone ? 4 : 0) / 12 + (profile ? 3 : 0) / 12;
    const issues: AtsIssue[] = [];
    if (!email) issues.push({ checkId: 'contact', severity: 'high', message: 'No email address detected.' });
    if (!phone) issues.push({ checkId: 'contact', severity: 'medium', message: 'No phone number detected.' });
    if (!profile) issues.push({ checkId: 'contact', severity: 'low', message: 'No LinkedIn or GitHub profile link detected.' });
    drafts.push({ id: 'contact', label: 'Contact information', weight: 12, ratio, rule: 'Email (5), phone (4), LinkedIn/GitHub (3) in plain text.', evidence: [email ? `Email: ${email}` : 'Email: not found', phone ? `Phone: ${phone}` : 'Phone: not found', profile ? `Profile: ${profile.url}` : 'Profile link: not found'], issues });
  }

  // 4. Skills section
  {
    const items = resume.skillsSectionItems.length;
    const ratio = !has('skills') ? 0 : items >= 6 ? 1 : 0.6;
    drafts.push({ id: 'skills-section', label: 'Skills section', weight: 10, ratio, rule: 'A dedicated, comma/line-separated skills section with 6+ items.', evidence: [has('skills') ? `${items} skill items detected` : 'No skills section'], issues: has('skills') ? (items < 6 ? [{ checkId: 'skills-section', severity: 'low', message: 'Skills section has few parseable items.' }] : []) : [{ checkId: 'skills-section', severity: 'high', message: 'Potential parsing risk: no dedicated Skills section — keyword extraction may miss your skills.' }] });
  }

  // 5-7. Experience, projects, education
  {
    const entries = resume.experience.length + resume.internships.length;
    drafts.push({ id: 'experience', label: 'Experience / internships', weight: 8, ratio: entries > 0 ? 1 : 0, rule: 'An Experience or Internships section with at least one dated entry.', evidence: [`${resume.experience.length} experience and ${resume.internships.length} internship entr${entries === 1 ? 'y' : 'ies'}`], issues: entries ? [] : [{ checkId: 'experience', severity: 'medium', message: 'No experience or internship entries detected. Many ATS filters look for this section.' }] });
    drafts.push({ id: 'projects', label: 'Projects', weight: 8, ratio: resume.projects.length >= 2 ? 1 : resume.projects.length === 1 ? 0.6 : 0, rule: 'A Projects section with two or more entries (important for freshers).', evidence: [`${resume.projects.length} project entr${resume.projects.length === 1 ? 'y' : 'ies'}`], issues: resume.projects.length ? [] : [{ checkId: 'projects', severity: 'medium', message: 'No projects section detected.' }] });
    const degree = resume.education.some((entry) => entry.degreeLevel && entry.degreeLevel !== 'SCHOOL');
    drafts.push({ id: 'education', label: 'Education', weight: 8, ratio: degree ? 1 : has('education') ? 0.5 : 0, rule: 'Education section with a recognisable degree.', evidence: resume.education.map((entry) => entry.raw.split('\n')[0]), issues: degree ? [] : [{ checkId: 'education', severity: 'medium', message: has('education') ? 'Potential parsing risk: degree name was not recognised.' : 'No Education section detected.' }] });
  }

  // 8. Dates
  {
    const dated = [...resume.experience, ...resume.internships];
    const withDates = dated.filter((entry) => entry.dates).length;
    const eduDated = resume.education.filter((entry) => entry.year).length;
    const total = dated.length + resume.education.length;
    const formats = new Set(
      (rawText.match(new RegExp(DATE_RANGE.source, 'gi')) ?? []).map((range) => (/[a-z]{3}/i.test(range) ? 'month-name' : /\//.test(range) ? 'numeric' : 'year-only')),
    );
    const ratio = total === 0 ? 0.5 : (withDates + eduDated) / total - (formats.size > 2 ? 0.2 : 0);
    const issues: AtsIssue[] = [];
    if (total > 0 && withDates + eduDated < total) issues.push({ checkId: 'dates', severity: 'medium', message: `${total - withDates - eduDated} entr${total - withDates - eduDated === 1 ? 'y has' : 'ies have'} no detectable dates.` });
    if (formats.size > 2) issues.push({ checkId: 'dates', severity: 'low', message: 'Dates use several formats; keep one format such as “Jun 2025 – Aug 2025”.' });
    drafts.push({ id: 'dates', label: 'Dates', weight: 7, ratio: Math.max(0, ratio), rule: 'Each experience/education entry has a parseable date in a consistent format.', evidence: [`${withDates + eduDated}/${total} entries dated`, `Formats: ${[...formats].join(', ') || 'none'}`], issues });
  }

  // 9. Formatting risks
  {
    const issues: AtsIssue[] = [];
    let ratio = 1;
    if (meta.tablesDetected > 0) {
      ratio -= 0.4;
      issues.push({ checkId: 'formatting', severity: 'medium', message: `Potential parsing risk: ${meta.tablesDetected} table(s) detected. Some ATS read tables out of order.` });
    }
    if (meta.imagesDetected > 0) {
      ratio -= 0.2;
      issues.push({ checkId: 'formatting', severity: 'low', message: `Potential parsing risk: ${meta.imagesDetected} image(s) detected. Text inside images is not parsed.` });
    }
    if (meta.multiColumnSuspected) {
      ratio -= 0.4;
      issues.push({ checkId: 'formatting', severity: 'medium', message: 'Potential parsing risk: layout looks multi-column. Columns can be merged line-by-line by ATS parsers.' });
    }
    const longLines = rawText.split('\n').filter((line) => line.length > 220).length;
    if (longLines > 2) {
      ratio -= 0.2;
      issues.push({ checkId: 'formatting', severity: 'low', message: `${longLines} very long lines detected; content may have been flattened from a complex layout.` });
    }
    drafts.push({ id: 'formatting', label: 'Formatting risks', weight: 7, ratio: Math.max(0, ratio), rule: 'Single column, no tables, no text in images.', evidence: [`Tables: ${meta.tablesDetected}`, `Images: ${meta.imagesDetected}`, `Multi-column suspected: ${meta.multiColumnSuspected ? 'yes' : 'no'}`], issues });
  }

  // 10. Exact JD keyword alignment
  {
    const required = job?.mandatorySkills ?? [];
    const lower = rawText.toLowerCase();
    const resumeIds = new Set(findSkillMentions(rawText).map((mention) => mention.skillId));
    const exact = required.filter((req) => lower.includes(req.originalPhrase.toLowerCase()) || lower.includes(req.canonicalName.toLowerCase()));
    const aliasOnly = required.filter((req) => !exact.includes(req) && resumeIds.has(req.canonical));
    const ratio = required.length ? (exact.length + aliasOnly.length * 0.5) / required.length : 1;
    const issues: AtsIssue[] = aliasOnly.map((req) => ({ checkId: 'keywords', severity: 'low' as const, message: `The JD says “${req.originalPhrase}” but your resume uses a different spelling. Simple keyword-based ATS may not equate them.` }));
    drafts.push({ id: 'keywords', label: 'JD keyword alignment', weight: 8, ratio, rule: 'Mandatory JD terms appear with the same wording (aliases earn half credit).', evidence: [`${exact.length}/${required.length} exact`, `${aliasOnly.length} alias-only`], issues, applicable: required.length > 0 });
  }

  const applicableWeight = drafts.filter((draft) => draft.applicable !== false).reduce((total, draft) => total + draft.weight, 0);
  const checks: ScoreComponent[] = drafts.map((draft) => {
    const applicable = draft.applicable !== false;
    const weight = applicable ? round1((draft.weight / applicableWeight) * 100) : 0;
    const ratio = Math.max(0, Math.min(1, draft.ratio));
    const issues = draft.issues ?? [];
    return {
      id: draft.id,
      label: draft.label,
      weight,
      earned: round1(weight * ratio),
      ratio,
      status: applicable ? statusOf(ratio) : 'pass',
      rule: draft.rule,
      evidence: draft.evidence,
      applicable,
      summary: !applicable ? 'Not scored for this job.' : issues.length ? issues.map((issue) => issue.message).join(' ') : `No parsing risk detected (${draft.evidence[0]}).`,
    };
  });
  const score = round1(Math.min(100, checks.reduce((total, check) => total + check.earned, 0)));
  const pointLosses: PointLoss[] = checks
    .filter((check) => check.weight - check.earned > 0.04)
    .map((check) => ({ id: `ats-${check.id}`, label: check.label, category: 'ATS Readiness', points: round1(check.weight - check.earned), items: drafts.find((d) => d.id === check.id)!.issues?.map((issue) => ({ label: issue.message, points: 0 })) ?? [] }))
    .sort((a, b) => b.points - a.points);

  return {
    score,
    checks,
    issues: drafts.flatMap((draft) => draft.issues ?? []),
    evidence: checks.flatMap((check) => check.evidence.slice(0, 1)),
    pointLosses,
    disclaimer: ATS_DISCLAIMER,
  };
};
