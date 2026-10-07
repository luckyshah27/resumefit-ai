import { describe, expect, it } from 'vitest';
import { classifyHeading, gradeEvidence, splitEntries, structureResume } from './resumeStructurer.js';
import { SAMPLE_RESUME } from '../test/fixtures.js';

describe('resume structurer', () => {
  const resume = structureResume(SAMPLE_RESUME);

  it('extracts candidate contact details', () => {
    expect(resume.candidate.name).toBe('Aditi Sharma');
    expect(resume.candidate.email).toBe('aditi.sharma@example.com');
    expect(resume.candidate.phone).toContain('98765');
    expect(resume.links.map((link) => link.type)).toEqual(expect.arrayContaining(['linkedin', 'github']));
  });

  it('detects standard sections, keeping skill sub-categories inside Skills', () => {
    const keys = resume.sections.map((section) => section.key);
    expect(keys).toEqual(expect.arrayContaining(['summary', 'education', 'skills', 'experience', 'projects', 'certifications', 'achievements']));
    expect(keys).not.toContain('other');
    expect(resume.skillsSectionItems).toContain('Postgres');
  });

  it('parses education with degree level, field and score', () => {
    expect(resume.education[0]).toMatchObject({ degreeLevel: 'BACHELOR', degree: 'B.Tech' });
    expect(resume.education[0].field).toMatch(/Computer Science/);
    expect(resume.education[0].score).toMatch(/8\.6/);
  });

  it('classifies an intern role in Experience as an internship with duration', () => {
    expect(resume.internships).toHaveLength(1);
    expect(resume.internships[0]).toMatchObject({ title: 'Software Engineering Intern', organization: 'CodeSprint Labs', durationMonths: 3 });
    expect(resume.internships[0].bullets).toHaveLength(3);
  });

  it('splits projects and captures their technologies', () => {
    expect(resume.projects.map((project) => project.title)).toEqual(['ShopFlow', 'Resume Analyzer']);
    expect(resume.projects[0].technologies).toEqual(expect.arrayContaining(['react', 'typescript', 'nodejs', 'mongodb']));
  });

  it('gives low evidence to skills that only appear in the Skills section', () => {
    const skill = (id: string) => resume.skills.find((item) => item.id === id);
    expect(skill('postgresql')?.evidenceStrength).toBe('LOW');
    expect(skill('docker')?.evidenceStrength).toBe('LOW');
    expect(skill('react')?.evidenceStrength).toBe('HIGH');
    expect(skill('react')?.evidence.some((item) => item.source === 'internship')).toBe(true);
    expect(skill('aws')?.evidenceStrength).toBe('MEDIUM');
  });

  it('records the original text and source of every evidence item', () => {
    const jest = resume.skills.find((item) => item.id === 'jest')!;
    expect(jest.evidence[0]).toMatchObject({ source: 'internship', entryTitle: 'Software Engineering Intern' });
    expect(jest.evidence[0].text).toContain('unit tests with Jest');
  });

  it('does not treat profile URLs as skill evidence', () => {
    expect(resume.skills.find((item) => item.id === 'github')).toBeUndefined();
  });

  it('repairs PDF line wrapping inside bullets', () => {
    const entries = splitEntries(['Data Pipeline | Python', '- Built an ETL job that loads 2 million rows', 'nightly into PostgreSQL with retries', '- Wrote tests']);
    expect(entries).toHaveLength(1);
    expect(entries[0].bullets[0]).toBe('Built an ETL job that loads 2 million rows nightly into PostgreSQL with retries');
  });

  it('grades evidence according to the documented rules', () => {
    expect(gradeEvidence([{ text: 'Python', source: 'skills' }])).toBe('LOW');
    expect(gradeEvidence([{ text: 'Tech: Python, Flask', source: 'project' }])).toBe('MEDIUM');
    expect(gradeEvidence([{ text: 'Built a Flask API serving 3 models', source: 'project' }])).toBe('HIGH');
  });

  it('flags non-standard ALL-CAPS headings', () => {
    expect(classifyHeading('MY JOURNEY')).toEqual({ key: 'other', standard: false });
    expect(classifyHeading('Work Experience')?.key).toBe('experience');
  });
});
