import { describe, expect, it } from 'vitest';
import { structureResume } from './resumeStructurer.js';
import { extractJob } from './jdExtractor.js';
import { analyzeInternship, roleRelevanceOf } from './projectAnalysis.js';
import { runAnalysis } from './scoringEngine.js';
import { requirementPriority } from './interviewPrep.js';
import { attributeChanges, changesFromDiff, compareReports } from './compare.js';
import { applyFixes } from './fixSuggestions.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';

const FRESHER_RESUME = `Karan Mehta
karan.mehta@example.com | github.com/karanm

EDUCATION
B.Tech in Computer Science, PES University, 2022 - 2026

SKILLS
Go, PostgreSQL, Docker, Git

FINAL YEAR PROJECT
Campus Event Booking API
- Built a REST API in Go with PostgreSQL for booking 40 campus events
- Containerized the service with Docker

INTERNSHIPS
Backend Intern | Acme Systems | Jan 2025 - Mar 2025
- Worked on various tasks and gained exposure to the codebase

ACHIEVEMENTS
- Finalist, Smart India Hackathon 2024
- Solved 400+ problems on LeetCode
- Contributed pull requests to an open-source Go CLI

Relevant Coursework: Data Structures, DBMS, Operating Systems
`;

describe('final-year student intelligence', () => {
  const resume = structureResume(FRESHER_RESUME);

  it('recognises final-year projects, hackathons, competitive programming, open source and coursework', () => {
    expect(resume.projects[0].isFinalYearProject).toBe(true);
    expect(resume.studentSignals).toMatchObject({
      isStudentOrFresher: true,
      finalYearProjects: ['Campus Event Booking API'],
      githubLinked: true,
      graduationYear: '2026',
    });
    expect(resume.studentSignals.hackathons[0]).toMatch(/Smart India Hackathon/);
    expect(resume.studentSignals.competitiveProgramming[0]).toMatch(/LeetCode/);
    expect(resume.studentSignals.openSource[0]).toMatch(/open-source/);
    expect(resume.studentSignals.coursework).toEqual(['Data Structures', 'DBMS', 'Operating Systems']);
  });

  it('flags generic internship descriptions and rates role relevance', () => {
    const job = extractJob('Junior Backend Developer\nRequirements\n- Go\n- PostgreSQL');
    const internship = analyzeInternship(resume.internships[0], job);
    expect(internship.flags.some((flag) => flag.startsWith('Generic description'))).toBe(true);
    expect(internship.flags).toContain('No technologies named.');
    expect(internship.roleRelevance).toBe('related');
    expect(roleRelevanceOf('Marketing Intern', job)).toBe('unrelated');
  });

  it('does not penalise freshers when the JD welcomes freshers', () => {
    const report = runAnalysis('Junior Backend Developer\nFreshers welcome.\nRequirements\n- Go\n- PostgreSQL\n- Docker', FRESHER_RESUME);
    const experience = report.jobFit.components.find((component) => component.id === 'experience')!;
    expect(experience.applicable).toBe(false);
    expect(experience.summary).toMatch(/freshers are not penalised/);
  });
});

describe('explanations, confidence and priorities', () => {
  const report = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);

  it('explains every Job Fit component in words', () => {
    for (const component of report.jobFit.components) expect(component.summary?.length).toBeGreaterThan(10);
    expect(report.jobFit.components.find((component) => component.id === 'mandatory')!.summary).toMatch(/Of 11 mandatory requirements: .*2 missing/);
  });

  it('gives every fix a confidence level consistent with the fact check', () => {
    for (const fix of report.fixes) {
      expect(['high', 'medium', 'low']).toContain(fix.confidence);
      if (!fix.guard.ok || fix.requiresUserInput || fix.requiresConfirmation) expect(fix.confidence).toBe('low');
    }
    expect(report.fixes.find((fix) => fix.type === 'weak-verb')!.confidence).toBe('high');
  });

  it('prioritises interview preparation by requirement gaps', () => {
    expect(requirementPriority('MANDATORY', 'MISSING')).toBe('HIGH');
    expect(requirementPriority('MANDATORY', 'MATCH')).toBe('MEDIUM');
    expect(requirementPriority('PREFERRED', 'MISSING')).toBe('MEDIUM');
    expect(requirementPriority('MANDATORY', 'STRONG_MATCH')).toBe('LOW');
    const plan = report.interview.prepPlan;
    expect(plan[0].priority).toBe('HIGH');
    expect(plan.find((topic) => topic.topic === 'PostgreSQL')!.priority).toBe('HIGH');
    expect(plan.find((topic) => topic.topic === 'Redis')!.priority).toBe('MEDIUM');
    const priorities = report.interview.questions.map((question) => question.priority);
    expect(priorities.indexOf('HIGH')).toBeLessThan(priorities.lastIndexOf('LOW'));
  });
});

describe('before/after attribution', () => {
  it('links requirement and category changes to the fixes that caused them', () => {
    const before = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);
    const weak = before.fixes.find((fix) => fix.type === 'weak-verb')!;
    const evidence = before.fixes.find((fix) => fix.type === 'add-evidence' && fix.targetRequirement?.startsWith('PostgreSQL'))!;
    const { text, changes } = applyFixes(SAMPLE_RESUME, [
      { id: weak.id, type: weak.type, operation: weak.operation, currentText: weak.currentText, anchor: weak.anchor, finalText: weak.suggestedText },
      { id: evidence.id, type: evidence.type, operation: evidence.operation, currentText: null, anchor: evidence.anchor, finalText: '- Designed the PostgreSQL schema for orders and wrote the migrations' },
    ]);
    const comparison = compareReports(before, runAnalysis(SAMPLE_JD, text), changes);
    const postgres = comparison.attribution.find((item) => item.group === 'Requirement' && item.target === 'PostgreSQL')!;
    expect(postgres.causes.map((cause) => cause.changeId)).toEqual([evidence.id]);
    const verbs = comparison.attribution.find((item) => item.target === 'Action verbs');
    expect(verbs?.causes.map((cause) => cause.changeId)).toContain(weak.id);
  });

  it('derives change records from a manual edit', () => {
    const changes = changesFromDiff('A\nB\nC', 'A\nB2\nC\nD');
    expect(changes.map((change) => [change.operation, change.before, change.after])).toEqual([
      ['replace', 'B', 'B2'],
      ['insert_after', null, 'D'],
    ]);
    expect(attributeChanges({ scores: [], categories: [], changedCategories: [], requirementChanges: [] }, [])).toEqual([]);
  });
});
