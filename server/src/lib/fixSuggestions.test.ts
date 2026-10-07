import { describe, expect, it } from 'vitest';
import { applyFixes } from './fixSuggestions.js';
import { checkFabrication, hasPlaceholders } from './fabricationGuard.js';
import { runAnalysis } from './scoringEngine.js';
import { compareReports } from './compare.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';

const report = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);

describe('fabrication guard', () => {
  it('flags new technologies, numbers and organisations', () => {
    const result = checkFabrication(SAMPLE_RESUME, 'Led a Kubernetes migration at Google that cut costs by 37%');
    const types = result.violations.map((violation) => violation.type);
    expect(result.ok).toBe(false);
    expect(types).toEqual(expect.arrayContaining(['new-skill', 'new-number', 'new-entity']));
  });

  it('accepts rewording that only uses facts from the resume', () => {
    expect(checkFabrication(SAMPLE_RESUME, 'Wrote unit tests with Jest, raising coverage from 45% to 78%').ok).toBe(true);
  });

  it('ignores [placeholders] because they are instructions, not claims', () => {
    expect(checkFabrication(SAMPLE_RESUME, 'Built X, [real result such as 40% faster]').ok).toBe(true);
    expect(hasPlaceholders('Built X, [real result]')).toBe(true);
    expect(hasPlaceholders('Built X')).toBe(false);
  });
});

describe('fix suggestions', () => {
  it('provides current text, suggested text, why, target requirement and evidence', () => {
    expect(report.fixes.length).toBeGreaterThan(5);
    for (const fix of report.fixes) {
      expect(fix.suggestedText.length).toBeGreaterThan(0);
      expect(fix.why.length).toBeGreaterThan(10);
      expect(fix.operation === 'replace' ? fix.currentText : fix.anchor).toBeTruthy();
    }
  });

  it('never invents facts: every auto-applicable suggestion passes the fabrication guard', () => {
    const auto = report.fixes.filter((fix) => !fix.requiresUserInput && !fix.requiresConfirmation);
    expect(auto.length).toBeGreaterThan(0);
    for (const fix of auto) expect(fix.guard).toEqual({ ok: true, violations: [] });
  });

  it('asks for confirmation before adding a missing skill and explains it must be true', () => {
    const missing = report.fixes.filter((fix) => fix.type === 'missing-skill');
    expect(missing.map((fix) => fix.targetRequirement)).toEqual(expect.arrayContaining([expect.stringContaining('Go')]));
    for (const fix of missing) {
      expect(fix.requiresConfirmation).toBe(true);
      expect(fix.userPrompt).toMatch(/only if/i);
      expect(fix.guard.ok).toBe(false);
    }
  });

  it('uses placeholders (not invented content) when evidence is missing', () => {
    const evidence = report.fixes.filter((fix) => fix.type === 'add-evidence' || fix.type === 'add-metric');
    expect(evidence.length).toBeGreaterThan(0);
    for (const fix of evidence) {
      expect(fix.requiresUserInput).toBe(true);
      expect(hasPlaceholders(fix.suggestedText)).toBe(true);
    }
  });

  it('applies fixes and refuses unfilled placeholders', () => {
    const weak = report.fixes.find((fix) => fix.type === 'weak-verb')!;
    const evidence = report.fixes.find((fix) => fix.type === 'add-evidence')!;
    const { text, changes } = applyFixes(SAMPLE_RESUME, [
      { id: weak.id, operation: weak.operation, currentText: weak.currentText, anchor: weak.anchor, finalText: weak.suggestedText },
      { id: evidence.id, operation: evidence.operation, currentText: evidence.currentText, anchor: evidence.anchor, finalText: evidence.suggestedText },
    ]);
    expect(changes[0].applied).toBe(true);
    expect(changes[1]).toMatchObject({ applied: false, reason: expect.stringMatching(/placeholder/) });
    expect(text).toContain(weak.suggestedText.trim());
    expect(text).not.toContain(weak.currentText!);
  });

  it('re-scores with the same engine and reports real deltas', () => {
    const evidence = report.fixes.find((fix) => fix.type === 'add-evidence' && fix.targetRequirement?.startsWith('PostgreSQL'))!;
    const userText = '- Designed the PostgreSQL schema for products and orders and wrote the migrations';
    const auto = report.fixes.filter((fix) => !fix.requiresUserInput && !fix.requiresConfirmation);
    const { text } = applyFixes(SAMPLE_RESUME, [
      ...auto.map((fix) => ({ id: fix.id, operation: fix.operation, currentText: fix.currentText, anchor: fix.anchor, finalText: fix.suggestedText })),
      { id: evidence.id, operation: evidence.operation, currentText: null, anchor: evidence.anchor, finalText: userText },
    ]);
    const after = runAnalysis(SAMPLE_JD, text);
    const comparison = compareReports(report, after);
    const jobFit = comparison.scores.find((score) => score.key === 'jobFit')!;
    expect(jobFit.after).toBe(after.scores.jobFit);
    expect(jobFit.delta).toBeCloseTo(after.scores.jobFit - report.scores.jobFit, 1);
    expect(jobFit.delta).toBeGreaterThan(0);
    expect(comparison.requirementChanges).toEqual(expect.arrayContaining([expect.objectContaining({ requirement: 'PostgreSQL', before: 'WEAK_EVIDENCE', after: 'STRONG_MATCH' })]));
    expect(comparison.changedCategories.length).toBeGreaterThan(0);
  });
});
