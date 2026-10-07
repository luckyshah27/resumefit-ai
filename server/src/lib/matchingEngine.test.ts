import { describe, expect, it } from 'vitest';
import { MANDATORY_TECH_PARTIAL_CAP, matchSkillRequirement, scoreJobFit } from './matchingEngine.js';
import { extractJob } from './jdExtractor.js';
import { resumeSkillMap, structureResume } from './resumeStructurer.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';

const job = extractJob(SAMPLE_JD);
const resume = structureResume(SAMPLE_RESUME);

describe('matching engine', () => {
  const result = scoreJobFit(job, resume);
  const state = (canonical: string) => result.requirementMatches.find((match) => match.canonical === canonical)?.finalMatchState;

  it('assigns match states from evidence strength', () => {
    expect(state('react')).toBe('STRONG_MATCH');
    expect(state('typescript')).toBe('MATCH');
    expect(state('postgresql')).toBe('WEAK_EVIDENCE');
    expect(state('go')).toBe('MISSING');
  });

  it('tracks exactMatch, semanticMatch and evidenceStrength separately', () => {
    const postgres = result.requirementMatches.find((match) => match.canonical === 'postgresql')!;
    expect(postgres).toMatchObject({ exactMatch: true, semanticMatch: null, evidenceStrength: 'LOW', credit: 0.4 });
    const go = result.requirementMatches.find((match) => match.canonical === 'go')!;
    expect(go).toMatchObject({ exactMatch: false, evidenceStrength: 'NONE', credit: 0 });
  });

  it('never marks a missing mandatory technology as present via semantic similarity', () => {
    const mysqlResume = structureResume('Ravi Kumar\nPROJECTS\nInventory API\n- Built REST endpoints with Express and MySQL serving 500 users\n- Designed MySQL schema with indexes');
    const requirement = extractJob('Requirements\n- Strong PostgreSQL experience').mandatorySkills[0];
    const match = matchSkillRequirement(requirement, resumeSkillMap(mysqlResume));
    expect(match.exactMatch).toBe(false);
    expect(match.finalMatchState).toBe('PARTIAL_MATCH');
    expect(match.semanticMatch?.relatedSkill).toBe('mysql');
    expect(match.credit).toBeLessThanOrEqual(MANDATORY_TECH_PARTIAL_CAP);
    expect(match.credit).toBeLessThan(0.4);
    expect(match.explanation).toMatch(/still a gap/);
  });

  it('keeps the score within 0-100 and attributes every lost point', () => {
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
    const lost = result.pointLosses.reduce((total, loss) => total + loss.points, 0);
    expect(Math.round((result.score + lost) * 10) / 10).toBe(100);
    const missing = result.pointLosses.find((loss) => loss.id === 'mandatory-missing')!;
    expect(missing.items.map((item) => item.label)).toEqual(expect.arrayContaining(['Go']));
  });

  it('normalises component weights to 100 and skips non-applicable components', () => {
    const total = result.components.filter((component) => component.applicable).reduce((sum, component) => sum + component.weight, 0);
    expect(Math.round(total)).toBe(100);
    expect(result.components.find((component) => component.id === 'experience')?.applicable).toBe(false);
  });

  it('is deterministic', () => {
    expect(scoreJobFit(job, structureResume(SAMPLE_RESUME))).toEqual(result);
  });

  it('raises the score when a weakly evidenced skill gets real evidence', () => {
    const improved = structureResume(SAMPLE_RESUME.replace('- Deployed the app on Render with a CI pipeline', '- Deployed the app on Render with a CI pipeline\n- Designed the PostgreSQL schema for orders and wrote migrations for 12 tables'));
    const after = scoreJobFit(job, improved);
    expect(after.requirementMatches.find((match) => match.canonical === 'postgresql')?.finalMatchState).toBe('STRONG_MATCH');
    expect(after.score).toBeGreaterThan(result.score);
  });
});
