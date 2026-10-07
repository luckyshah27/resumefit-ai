import { describe, expect, it } from 'vitest';
import { runAnalysis } from './scoringEngine.js';
import { diffLines } from './compare.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';

describe('interview preparation', () => {
  const report = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);
  const { interview } = report;

  it('generates every question category for a backend-leaning role', () => {
    const categories = new Set(interview.questions.map((question) => question.category));
    expect([...categories]).toEqual(expect.arrayContaining(['technical', 'project', 'behavioral', 'role', 'system-design', 'gap']));
  });

  it('grounds questions in the resume and JD', () => {
    expect(interview.questions.some((question) => question.question.includes('ShopFlow'))).toBe(true);
    expect(interview.questions.some((question) => question.category === 'gap' && question.relatedRequirement === 'Go')).toBe(true);
    expect(interview.questions.every((question) => question.why.length > 0)).toBe(true);
  });

  it('computes readiness out of 100 and increases it with practice', () => {
    expect(interview.readiness).toBeGreaterThan(0);
    expect(interview.readiness).toBeLessThanOrEqual(85);
    const practiced = runAnalysis(SAMPLE_JD, SAMPLE_RESUME, undefined, interview.questions.slice(0, 10).map((question) => question.id));
    expect(practiced.interview.readiness).toBeGreaterThan(interview.readiness);
    expect(practiced.interview.evidenceReadiness).toBe(interview.evidenceReadiness);
  });
});

describe('diffLines', () => {
  it('produces a minimal line diff', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'B' },
      { type: 'same', text: 'c' },
      { type: 'added', text: 'd' },
    ]);
  });
});
