import { describe, expect, it } from 'vitest';
import { evaluateJobFit, runAnalysis, SCORING_VERSION } from './scoringEngine.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';

describe('evaluateJobFit', () => {
  it('returns a deterministic score within the expected range', () => {
    const analysis = evaluateJobFit(
      'We need a React frontend engineer with TypeScript, JavaScript, APIs, Git, and teamwork.',
      'React Developer with JavaScript, TypeScript, REST APIs, Git, and UI engineering experience in web applications.',
    );

    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.overallScore).toBeLessThanOrEqual(100);
    expect(analysis.scoringVersion).toBe(SCORING_VERSION);
    expect(evaluateJobFit('We need a React frontend engineer with TypeScript.', 'React and TypeScript developer')).toEqual(
      evaluateJobFit('We need a React frontend engineer with TypeScript.', 'React and TypeScript developer'),
    );
  });

  it('surfaces matched and missing requirements clearly', () => {
    const analysis = evaluateJobFit(
      'Frontend Engineer requiring React, TypeScript, JavaScript, Node, APIs, and MongoDB.',
      'Experienced in React, TypeScript, JavaScript, REST APIs, and problem solving.',
    );

    expect(analysis.matchedRequirements.length).toBeGreaterThan(0);
    expect(analysis.missingRequirements).toContain('MongoDB');
    expect(analysis.requirementMatchScore).toBeGreaterThanOrEqual(0);
    expect(analysis.categories[0].matchedRequirements.length).toBeGreaterThan(0);
  });
});

describe('runAnalysis', () => {
  const report = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);

  it('produces three independent headline scores plus interview readiness', () => {
    for (const value of Object.values(report.scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(report.scores.jobFit).not.toBe(report.scores.atsReadiness);
    expect(report.scores.jobFit).not.toBe(report.scores.resumeQuality);
  });

  it('derives "costing me points" from the engines, summing to 100 - score', () => {
    const jobFitLoss = report.costingPoints.jobFit.reduce((total, loss) => total + loss.points, 0);
    expect(Math.round((jobFitLoss + report.scores.jobFit) * 10) / 10).toBe(100);
    const qualityLoss = report.costingPoints.resumeQuality.reduce((total, loss) => total + loss.points, 0);
    expect(Math.abs(qualityLoss + report.scores.resumeQuality - 100)).toBeLessThan(0.6);
  });

  it('includes project and internship analysis', () => {
    expect(report.projectAnalysis.projects).toHaveLength(2);
    expect(report.projectAnalysis.internships).toHaveLength(1);
  });

  it('is fully deterministic', () => {
    expect(runAnalysis(SAMPLE_JD, SAMPLE_RESUME)).toEqual(report);
  });
});
