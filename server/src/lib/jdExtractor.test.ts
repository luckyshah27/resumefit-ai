import { describe, expect, it } from 'vitest';
import { extractExperienceRequirement, extractJob } from './jdExtractor.js';
import { SAMPLE_JD } from '../test/fixtures.js';

describe('job description extractor', () => {
  const job = extractJob(SAMPLE_JD);

  it('extracts role, company and seniority', () => {
    expect(job.role).toBe('Junior Full Stack Developer');
    expect(job.company).toBe('Acme Fintech');
    expect(job.seniority).toBe('JUNIOR');
  });

  it('extracts experience and education requirements', () => {
    expect(job.experience).toMatchObject({ minYears: 0, maxYears: 2 });
    expect(job.education).toMatchObject({ required: true, minLevel: 'BACHELOR' });
    expect(job.education.fields).toContain('Computer Science');
  });

  it('separates mandatory and preferred skills', () => {
    const mandatory = job.mandatorySkills.map((req) => req.canonical);
    const preferred = job.preferredSkills.map((req) => req.canonical);
    expect(mandatory).toEqual(expect.arrayContaining(['react', 'typescript', 'javascript', 'nodejs', 'express', 'rest-api', 'postgresql', 'go', 'git']));
    expect(preferred).toEqual(expect.arrayContaining(['docker', 'aws', 'redis', 'graphql']));
    expect(mandatory.some((id) => preferred.includes(id))).toBe(false);
  });

  it('stores original phrase, canonical name, importance and category', () => {
    const go = job.mandatorySkills.find((req) => req.canonical === 'go')!;
    expect(go).toMatchObject({ originalPhrase: 'GoLang', canonicalName: 'Go', importance: 'MANDATORY', category: 'language' });
    const postgres = job.mandatorySkills.find((req) => req.canonical === 'postgresql')!;
    expect(postgres.originalPhrase).toBe('Postgres');
    expect(postgres.originalPhrases).toEqual(expect.arrayContaining(['PostgreSQL', 'Postgres']));
    expect(job.mandatorySkills.find((req) => req.canonical === 'rest-api')?.originalPhrase).toBe('RESTful APIs');
  });

  it('extracts responsibilities with keywords and skills', () => {
    expect(job.responsibilities).toHaveLength(5);
    expect(job.responsibilities[1].skills).toEqual(expect.arrayContaining(['rest-api', 'nodejs', 'express']));
    expect(job.tools).toEqual(expect.arrayContaining(['Git', 'Docker', 'AWS']));
    expect(job.domainKeywords).toContain('fintech');
  });

  it('marks cue-word skills as preferred even without a preferred section', () => {
    const plain = extractJob('Data Analyst\nWe need strong SQL and Python skills. Tableau is a plus. Experience with Power BI is required.');
    expect(plain.mandatorySkills.map((req) => req.canonical)).toEqual(expect.arrayContaining(['sql', 'python', 'power-bi']));
    expect(plain.preferredSkills.map((req) => req.canonical)).toContain('tableau');
  });

  it('parses experience ranges and minimums', () => {
    expect(extractExperienceRequirement('Requires 3+ years of backend experience')).toMatchObject({ minYears: 3, maxYears: null });
    expect(extractExperienceRequirement('Freshers welcome')).toMatchObject({ minYears: 0 });
    expect(extractExperienceRequirement('No mention')).toMatchObject({ minYears: null });
  });
});
