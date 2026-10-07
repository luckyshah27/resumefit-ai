import { checkFabrication, hasPlaceholders, type GuardResult } from './fabricationGuard.js';
import { findSkillMentions } from './skillOntology.js';
import type { AtsResult } from './atsReadiness.js';
import type { JobFitResult } from './matchingEngine.js';
import type { StructuredJob, StructuredResume } from './types.js';
import { hasMetric, startsWithActionVerb, strengthenOpening } from '../utils/text.js';

export type FixOperation = 'replace' | 'insert_after' | 'insert_before';

export type FixSuggestion = {
  id: string;
  type: 'weak-verb' | 'keyword-alignment' | 'summary' | 'add-evidence' | 'add-metric' | 'missing-skill' | 'contact' | 'heading' | 'responsibility';
  title: string;
  section: string;
  currentText: string | null;
  suggestedText: string;
  operation: FixOperation;
  anchor: string | null;
  why: string;
  targetRequirement: string | null;
  evidenceUsed: string[];
  impact: 'high' | 'medium' | 'low';
  /** Template text with [placeholders] the user must replace with true information. */
  requiresUserInput: boolean;
  /** The change adds a claim (e.g. a skill) the resume does not yet contain; the user must confirm it is true. */
  requiresConfirmation: boolean;
  userPrompt: string | null;
  guard: GuardResult;
  /** How safe the suggestion is to apply as-is. */
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
};

const CONFIDENCE: Record<FixSuggestion['type'], { level: FixSuggestion['confidence']; reason: string }> = {
  'weak-verb': { level: 'high', reason: 'Rewords your own sentence; no facts are added or removed.' },
  'keyword-alignment': { level: 'high', reason: 'Uses the JD’s spelling for a skill you already list.' },
  heading: { level: 'high', reason: 'Renames a heading only.' },
  summary: { level: 'medium', reason: 'Built only from skills already evidenced in your resume; check that it reads naturally.' },
  'add-evidence': { level: 'low', reason: 'Template — needs your real experience before it can be applied.' },
  'add-metric': { level: 'low', reason: 'Template — needs a real, defensible number.' },
  responsibility: { level: 'low', reason: 'Template — describe a real task in your own words.' },
  contact: { level: 'low', reason: 'Template — needs your real profile URLs.' },
  'missing-skill': { level: 'low', reason: 'Adds a new claim; apply only if it is true.' },
};

const firstLineContaining = (text: string, needle: string) =>
  text.split('\n').find((line) => line.toLowerCase().includes(needle.toLowerCase()))?.trim() ?? null;

const bulletLine = (text: string, bullet: string) => {
  // Bullets may have been re-joined from wrapped PDF lines; anchor on the first line of the bullet.
  const head = bullet.slice(0, 40);
  return text.split('\n').find((line) => line.includes(head))?.trim() ?? null;
};

export const generateFixSuggestions = (resumeText: string, resume: StructuredResume, job: StructuredJob, jobFit: JobFitResult, _ats?: AtsResult): FixSuggestion[] => {
  const suggestions: Array<Omit<FixSuggestion, 'guard' | 'id' | 'confidence' | 'confidenceReason'>> = [];
  const entries = [
    ...resume.internships.map((entry) => ({ entry, section: 'Internship' })),
    ...resume.experience.map((entry) => ({ entry, section: 'Experience' })),
    ...resume.projects.map((entry) => ({ entry, section: 'Project' })),
  ];
  const jdSkillIds = new Set([...job.mandatorySkills, ...job.preferredSkills].map((req) => req.canonical));
  const evidencedJdSkills = resume.skills.filter((skill) => jdSkillIds.has(skill.id) && skill.evidenceStrength !== 'LOW' && !skill.inferredFrom).map((skill) => skill.skill);

  // 1. Weak openings -> stronger verbs (pure rewording).
  for (const { entry, section } of entries) {
    for (const bullet of entry.bullets) {
      const rewrite = strengthenOpening(bullet);
      if (!rewrite || startsWithActionVerb(bullet)) continue;
      const line = bulletLine(resumeText, bullet);
      if (!line) continue;
      const prefix = line.slice(0, line.indexOf(bullet.slice(0, 15)));
      suggestions.push({
        type: 'weak-verb',
        title: `Stronger opening in “${entry.title}”`,
        section: `${section}: ${entry.title}`,
        currentText: line,
        suggestedText: `${prefix}${rewrite.text}`.slice(0, line.length + 80),
        operation: 'replace',
        anchor: null,
        why: `“${rewrite.rule}” is passive and hides your contribution. Starting with an action verb is easier to scan and improves the Action Verbs score.`,
        targetRequirement: 'Resume Quality · Action verbs',
        evidenceUsed: [bullet],
        impact: 'medium',
        requiresUserInput: false,
        requiresConfirmation: false,
        userPrompt: null,
      });
    }
  }

  // 2. Use the JD's exact wording for skills you already have (no new facts).
  const lowerResume = resumeText.toLowerCase();
  for (const match of jobFit.requirementMatches.filter((m) => m.importance === 'MANDATORY' && m.exactMatch)) {
    const req = job.mandatorySkills.find((r) => r.id === match.requirementId);
    if (!req || lowerResume.includes(req.originalPhrase.toLowerCase()) || lowerResume.includes(req.canonicalName.toLowerCase())) continue;
    const found = resumeText
      .split('\n')
      .map((line) => ({ line: line.trim(), mention: findSkillMentions(line).find((mention) => mention.skillId === req.canonical) }))
      .find((item) => item.mention);
    if (!found?.mention) continue;
    const mentionLine = found.line;
    const aliasText = found.mention.matchedText;
    const used = match.evidence.map((item) => item.text).join(' ');
    suggestions.push({
      type: 'keyword-alignment',
      title: `Use the JD's wording: “${req.originalPhrase}”`,
      section: 'Skills / wording',
      currentText: mentionLine,
      suggestedText: mentionLine.replace(aliasText, req.originalPhrase),
      operation: 'replace',
      anchor: null,
      why: `The JD says “${req.originalPhrase}” and you wrote “${aliasText}”. They mean the same thing, but simple keyword-based ATS filters may not equate them.`,
      targetRequirement: `${req.canonicalName} (mandatory)`,
      evidenceUsed: [used.slice(0, 160)],
      impact: 'low',
      requiresUserInput: false,
      requiresConfirmation: false,
      userPrompt: null,
    });
  }

  // 3. Summary built only from evidenced facts.
  const projectCount = resume.projects.length;
  const internshipCount = resume.internships.length;
  const factual = [
    projectCount ? `${projectCount} project${projectCount > 1 ? 's' : ''}` : '',
    internshipCount ? `${internshipCount === 1 ? 'an internship' : `${internshipCount} internships`}` : '',
  ].filter(Boolean).join(' and ');
  if (evidencedJdSkills.length >= 2) {
    const skillsPhrase = evidencedJdSkills.slice(0, 5).join(', ');
    const role = job.role !== 'Unspecified role' ? job.role.replace(/^(junior|senior|sr\.?|jr\.?)\s+/i, '') : null;
    if (resume.summary) {
      const summaryLine = firstLineContaining(resumeText, resume.summary.slice(0, 40));
      const mentionsRole = role ? resume.summary.toLowerCase().includes(role.toLowerCase()) : true;
      const mentionsSkills = evidencedJdSkills.filter((skill) => resume.summary!.toLowerCase().includes(skill.toLowerCase())).length >= 2;
      if (summaryLine && (!mentionsRole || !mentionsSkills)) {
        suggestions.push({
          type: 'summary',
          title: 'Target your summary to this role',
          section: 'Summary',
          currentText: summaryLine,
          suggestedText: `${role ? `Aspiring ${role}. ` : ''}${summaryLine.replace(/\.?$/, '.')} Hands-on work with ${skillsPhrase}${factual ? ` across ${factual}` : ''}.`,
          operation: 'replace',
          anchor: null,
          why: 'Recruiters read the summary first. It currently does not connect your demonstrated skills to this role. Every skill named here is already evidenced in your projects or internships.',
          targetRequirement: `${job.role} · role alignment`,
          evidenceUsed: evidencedJdSkills.slice(0, 5).map((skill) => `${skill}: evidenced in projects/experience`),
          impact: 'medium',
          requiresUserInput: false,
          requiresConfirmation: false,
          userPrompt: null,
        });
      }
    } else {
      const firstHeading = resume.sections.find((section) => section.key !== 'header')?.heading;
      const anchor = firstHeading ? firstLineContaining(resumeText, firstHeading) : null;
      if (anchor) {
        suggestions.push({
          type: 'summary',
          title: 'Add a short, factual summary',
          section: 'Summary',
          currentText: null,
          suggestedText: `SUMMARY\n${role ? `Aspiring ${role} with` : 'Candidate with'} hands-on work in ${skillsPhrase}${factual ? ` across ${factual}` : ''}.\n`,
          operation: 'insert_before',
          anchor,
          why: 'There is no summary. A two-line summary that names your strongest relevant skills improves role alignment and completeness. It is generated only from skills you already demonstrate.',
          targetRequirement: `${job.role} · role alignment`,
          evidenceUsed: evidencedJdSkills.slice(0, 5).map((skill) => `${skill}: evidenced in projects/experience`),
          impact: 'medium',
          requiresUserInput: false,
          requiresConfirmation: false,
          userPrompt: null,
        });
      }
    }
  }

  // 4. Skills that are only listed: ask for real evidence (template with placeholders).
  const bestEntry = [...entries].sort((a, b) => b.entry.technologies.filter((id) => jdSkillIds.has(id)).length - a.entry.technologies.filter((id) => jdSkillIds.has(id)).length)[0];
  for (const match of jobFit.requirementMatches.filter((m) => m.finalMatchState === 'WEAK_EVIDENCE').slice(0, 5)) {
    const anchorBullet = bestEntry?.entry.bullets.at(-1);
    const anchor = anchorBullet ? bulletLine(resumeText, anchorBullet) : null;
    if (!anchor) continue;
    const bulletPrefix = anchor.match(/^\s*([•●▪◦\-–*])\s+/)?.[0] ?? '- ';
    suggestions.push({
      type: 'add-evidence',
      title: `Show where you used ${match.requirement}`,
      section: `${bestEntry.section}: ${bestEntry.entry.title}`,
      currentText: null,
      suggestedText: `${bulletPrefix}[Action verb] [what you built or did] using ${match.requirement}, [real result, e.g. faster queries or users served]`,
      operation: 'insert_after',
      anchor,
      why: `${match.requirement} is a ${match.importance.toLowerCase()} requirement but appears only in your skills list, so it gets only 40% credit. A bullet showing real use moves it to a strong match.`,
      targetRequirement: `${match.requirement} (${match.importance.toLowerCase()})`,
      evidenceUsed: match.evidence.map((item) => `${item.source}: ${item.text}`).slice(0, 2),
      impact: match.importance === 'MANDATORY' ? 'high' : 'medium',
      requiresUserInput: true,
      requiresConfirmation: false,
      userPrompt: `Only add this if you genuinely used ${match.requirement} in “${bestEntry.entry.title}” (or another project). Replace every [bracket] with what you actually did.`,
    });
  }

  // 5. Bullets without measurable results.
  const noMetric = entries.flatMap(({ entry, section }) => entry.bullets.filter((bullet) => !hasMetric(bullet)).map((bullet) => ({ entry, section, bullet }))).slice(0, 3);
  for (const { entry, section, bullet } of noMetric) {
    const line = bulletLine(resumeText, bullet);
    if (!line || line.length < bullet.slice(0, 40).length) continue;
    const base = (strengthenOpening(bullet)?.text ?? bullet).replace(/\.$/, '');
    const prefix = line.slice(0, Math.max(0, line.indexOf(bullet.slice(0, 15))));
    suggestions.push({
      type: 'add-metric',
      title: `Quantify the result in “${entry.title}”`,
      section: `${section}: ${entry.title}`,
      currentText: line,
      suggestedText: `${prefix}${base}, [real measurable result — e.g. number of users, % faster, records processed]`,
      operation: 'replace',
      anchor: null,
      why: 'Bullets with a measurable outcome are more credible and raise the Measurable Outcomes score.',
      targetRequirement: 'Resume Quality · Measurable outcomes',
      evidenceUsed: [bullet],
      impact: 'medium',
      requiresUserInput: true,
      requiresConfirmation: false,
      userPrompt: 'Use a number you can defend in an interview. If you do not know the number, skip this fix.',
    });
  }

  // 6. Missing mandatory skills: only if genuinely true, add to the skills list.
  const skillLines = resume.sections.some((section) => section.key === 'skills')
    ? resumeText.split('\n').map((line) => line.trim()).filter((line) => resume.skillsSectionItems.some((item) => item.length > 1 && line.includes(item)))
    : [];
  const CATEGORY_LINE: Record<string, RegExp> = {
    language: /languag/i,
    frontend: /front|web|ui/i,
    backend: /back|server|framework/i,
    database: /data ?bases?|db/i,
    mobile: /mobile/i,
    ml: /ml|machine|ai\b|data/i,
    data: /data|analytics/i,
  };
  for (const match of jobFit.requirementMatches.filter((m) => m.importance === 'MANDATORY' && m.finalMatchState === 'MISSING' && m.category !== 'soft')) {
    if (!skillLines.length) break;
    const pattern = CATEGORY_LINE[match.category] ?? /tool|devops|cloud|other|concept|practice/i;
    const skillsLine = skillLines.find((line) => line.includes(':') && pattern.test(line.split(':')[0])) ?? skillLines[skillLines.length - 1];
    suggestions.push({
      type: 'missing-skill',
      title: `${match.requirement} is required but missing`,
      section: 'Skills',
      currentText: skillsLine,
      suggestedText: `${skillsLine.replace(/[.,\s]+$/, '')}, ${match.originalPhrase}`,
      operation: 'replace',
      anchor: null,
      why: `The JD lists “${match.originalPhrase}” as mandatory and it is not on your resume. If you have used it, list it and describe the work; if not, this is a learning gap — do not add it.`,
      targetRequirement: `${match.requirement} (mandatory)`,
      evidenceUsed: [],
      impact: 'high',
      requiresUserInput: false,
      requiresConfirmation: true,
      userPrompt: `Apply only if you have real experience with ${match.requirement}. Then also add a project or internship bullet showing it.`,
    });
  }

  // 7. Missing profile links.
  if (!resume.links.some((link) => link.type === 'linkedin' || link.type === 'github')) {
    const contactLine = resume.candidate.email ? firstLineContaining(resumeText, resume.candidate.email) : null;
    if (contactLine) {
      suggestions.push({
        type: 'contact',
        title: 'Add a LinkedIn or GitHub link',
        section: 'Header',
        currentText: contactLine,
        suggestedText: `${contactLine} | [linkedin.com/in/your-profile] | [github.com/your-username]`,
        operation: 'replace',
        anchor: null,
        why: 'Recruiters and ATS profiles commonly look for a LinkedIn/GitHub link; for freshers GitHub is direct project evidence.',
        targetRequirement: 'ATS Readiness · Contact information',
        evidenceUsed: [contactLine],
        impact: 'low',
        requiresUserInput: true,
        requiresConfirmation: false,
        userPrompt: 'Replace the brackets with your real profile URLs, or delete the one you do not have.',
      });
    }
  }

  // 8. Non-standard headings that map to a known section.
  for (const section of resume.sections.filter((s) => !s.standardHeading && s.key !== 'other')) {
    const line = firstLineContaining(resumeText, section.heading);
    if (!line) continue;
    const standard = { summary: 'SUMMARY', education: 'EDUCATION', skills: 'SKILLS', experience: 'EXPERIENCE', internships: 'INTERNSHIPS', projects: 'PROJECTS', certifications: 'CERTIFICATIONS', achievements: 'ACHIEVEMENTS', links: 'LINKS', activities: 'ACTIVITIES', publications: 'PUBLICATIONS' }[section.key as string];
    if (!standard) continue;
    suggestions.push({
      type: 'heading',
      title: `Rename “${section.heading}” to “${standard}”`,
      section: section.heading,
      currentText: line,
      suggestedText: standard,
      operation: 'replace',
      anchor: null,
      why: 'Potential parsing risk: ATS parsers map content using conventional headings.',
      targetRequirement: 'ATS Readiness · Standard headings',
      evidenceUsed: [line],
      impact: 'medium',
      requiresUserInput: false,
      requiresConfirmation: false,
      userPrompt: null,
    });
  }

  // 9. Responsibilities with no matching evidence.
  for (const match of jobFit.responsibilityMatches.filter((m) => m.finalMatchState === 'MISSING' || m.finalMatchState === 'WEAK_EVIDENCE').slice(0, 3)) {
    const anchorBullet = bestEntry?.entry.bullets.at(-1);
    const anchor = anchorBullet ? bulletLine(resumeText, anchorBullet) : null;
    if (!anchor) continue;
    const bulletPrefix = anchor.match(/^\s*([•●▪◦\-–*])\s+/)?.[0] ?? '- ';
    suggestions.push({
      type: 'responsibility',
      title: 'Cover a JD responsibility',
      section: `${bestEntry.section}: ${bestEntry.entry.title}`,
      currentText: null,
      suggestedText: `${bulletPrefix}[Describe a real task where you ${match.responsibility.charAt(0).toLowerCase()}${match.responsibility.slice(1).replace(/\.$/, '')}]`,
      operation: 'insert_after',
      anchor,
      why: `The JD expects you to “${match.responsibility}”. Nothing in your resume currently shows this (coverage ${Math.round(match.coverage * 100)}%).`,
      targetRequirement: `Responsibility: ${match.responsibility}`,
      evidenceUsed: match.bestEvidence ? [match.bestEvidence] : [],
      impact: 'medium',
      requiresUserInput: true,
      requiresConfirmation: false,
      userPrompt: 'Add this only if you have done something comparable (in a project, internship, club or course). Write it in your own words.',
    });
  }

  // Only the target role title may appear without resume support ("Aspiring Data Analyst").
  const allowed = [job.role];
  const impactRank = { high: 0, medium: 1, low: 2 };
  return suggestions
    .filter((suggestion, index, list) => list.findIndex((other) => other.currentText === suggestion.currentText && other.type === suggestion.type && other.suggestedText === suggestion.suggestedText) === index)
    .map((suggestion, index) => {
      const guard = checkFabrication(resumeText, suggestion.suggestedText, allowed);
      const requiresUserInput = suggestion.requiresUserInput || hasPlaceholders(suggestion.suggestedText);
      const base = CONFIDENCE[suggestion.type];
      // A suggestion that fails the fact check can never be high confidence.
      const confidence = !guard.ok || requiresUserInput || suggestion.requiresConfirmation ? 'low' : base.level;
      return {
        ...suggestion,
        id: `fix-${index + 1}-${suggestion.type}`,
        guard,
        requiresUserInput,
        confidence,
        confidenceReason: confidence === base.level ? base.reason : 'Needs your input or confirmation before it can be applied.',
      };
    })
    .sort((a, b) => impactRank[a.impact] - impactRank[b.impact]);
};

export type AppliedFix = { id: string; type?: string; operation: FixOperation; currentText: string | null; anchor: string | null; finalText: string; confirmed?: boolean };

export type FixChange = { id: string; type?: string; operation: FixOperation; before: string | null; after: string; applied: boolean; reason?: string; confirmedByUser?: boolean };

const flexible = (value: string) => new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));

/** Applies accepted fixes to the resume text. Returns the new text plus a change log. */
export const applyFixes = (resumeText: string, fixes: AppliedFix[]) => {
  let text = resumeText;
  const changes: FixChange[] = [];
  const record = (fix: AppliedFix, change: Omit<FixChange, 'id' | 'type' | 'operation' | 'confirmedByUser'>) =>
    changes.push({ id: fix.id, type: fix.type, operation: fix.operation, confirmedByUser: fix.confirmed || undefined, ...change });
  // Inserts never change their anchor line, so run them before replacements that might rewrite that anchor.
  const ordered = [...fixes.filter((fix) => fix.operation !== 'replace'), ...fixes.filter((fix) => fix.operation === 'replace')];
  for (const fix of ordered) {
    if (hasPlaceholders(fix.finalText)) {
      record(fix, { before: fix.currentText, after: fix.finalText, applied: false, reason: 'Contains unfilled [placeholders]' });
      continue;
    }
    const target = fix.operation === 'replace' ? fix.currentText : fix.anchor;
    if (!target) {
      record(fix, { before: null, after: fix.finalText, applied: false, reason: 'Missing target text' });
      continue;
    }
    const pattern = flexible(target);
    const match = text.match(pattern);
    if (!match || match.index === undefined) {
      record(fix, { before: target, after: fix.finalText, applied: false, reason: 'Target text no longer present (it may have been changed by another fix)' });
      continue;
    }
    const start = match.index;
    const end = start + match[0].length;
    if (fix.operation === 'replace') text = `${text.slice(0, start)}${fix.finalText}${text.slice(end)}`;
    else if (fix.operation === 'insert_after') text = `${text.slice(0, end)}\n${fix.finalText}${text.slice(end)}`;
    else text = `${text.slice(0, start)}${fix.finalText.replace(/\n?$/, '\n')}\n${text.slice(start)}`;
    record(fix, { before: fix.operation === 'replace' ? match[0] : null, after: fix.finalText, applied: true });
  }
  // Report changes in the order the user selected them.
  return { text, changes: fixes.map((fix) => changes.find((change) => change.id === fix.id)!) };
};

