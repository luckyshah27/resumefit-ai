import { describe, expect, it } from 'vitest';
import { runAnalysis, SCORING_VERSION } from './scoringEngine.js';
import { applyFixes } from './fixSuggestions.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';
import { DATASET } from '../research/experiment.js';

const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = (values: number[]) => round1(values.reduce((total, value) => total + value, 0));

/**
 * Pins the example verified in the browser walkthrough (Job Fit 68.5 → 73.7, ATS 99.3, Quality 83.6 → 89.5).
 * Any change to these numbers is a scoring change and must bump SCORING_VERSION.
 */
describe('verified example (regression pin)', () => {
  it('reproduces the verified scores (unchanged since 2.0.0; 2.1.0 only adds the malformed-extraction rule)', () => {
    expect(SCORING_VERSION).toBe('2.1.0');
    const before = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);
    expect(before.scores.jobFit).toBe(68.5);
    expect(before.scores.atsReadiness).toBe(99.3);
    expect(before.scores.resumeQuality).toBe(83.6);

    const auto = before.fixes.filter((fix) => !fix.requiresUserInput && !fix.requiresConfirmation);
    const evidence = before.fixes.find((fix) => fix.type === 'add-evidence' && fix.targetRequirement?.startsWith('PostgreSQL'))!;
    const { text } = applyFixes(SAMPLE_RESUME, [
      ...auto.map((fix) => ({ id: fix.id, operation: fix.operation, currentText: fix.currentText, anchor: fix.anchor, finalText: fix.suggestedText })),
      { id: evidence.id, operation: evidence.operation, currentText: null, anchor: evidence.anchor, finalText: '- Designed the PostgreSQL schema for orders and wrote the migrations' },
    ]);
    const after = runAnalysis(SAMPLE_JD, text);
    expect(after.scores.jobFit).toBe(73.7);
    expect(after.scores.resumeQuality).toBe(89.5);
  });
});

describe('score integrity invariants', () => {
  // Every labelled job × resume pair in the research dataset plus the sample: 61 reports.
  const pairs = [
    { jd: SAMPLE_JD, resume: SAMPLE_RESUME },
    ...DATASET.jobs.flatMap((job) => DATASET.resumes.map((resume) => ({ jd: job.text, resume: resume.text }))),
  ];
  const reports = pairs.map(({ jd, resume }) => runAnalysis(jd, resume));

  it('sum(category earned) == final score for Job Fit, ATS, Quality and Interview readiness', () => {
    for (const report of reports) {
      expect(sum(report.jobFit.components.map((c) => c.earned))).toBe(report.scores.jobFit);
      expect(sum(report.ats.checks.map((c) => c.earned))).toBe(report.scores.atsReadiness);
      expect(sum(report.quality.components.map((c) => c.earned))).toBe(report.scores.resumeQuality);
      expect(sum(report.interview.components.map((c) => c.earned))).toBe(report.scores.interviewReadiness);
    }
  });

  it('lost points == 100 - final score for every score', () => {
    for (const report of reports) {
      expect(round1(sum(report.costingPoints.jobFit.map((l) => l.points)) + report.scores.jobFit)).toBe(100);
      expect(round1(sum(report.costingPoints.atsReadiness.map((l) => l.points)) + report.scores.atsReadiness)).toBe(100);
      expect(round1(sum(report.costingPoints.resumeQuality.map((l) => l.points)) + report.scores.resumeQuality)).toBe(100);
    }
  });

  it('applicable weights sum to 100 and every component carries a rule and evidence', () => {
    for (const report of reports) {
      for (const group of [report.jobFit.components, report.ats.checks, report.quality.components]) {
        expect(Math.round(sum(group.filter((c) => c.applicable).map((c) => c.weight)))).toBe(100);
        for (const component of group) {
          expect(component.rule.length).toBeGreaterThan(0);
          expect(component.evidence.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every report carries the scoring version', () => {
    for (const report of reports) expect(report.scoringVersion).toBe(SCORING_VERSION);
  });
});
