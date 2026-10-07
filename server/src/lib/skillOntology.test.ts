import { describe, expect, it } from 'vitest';
import { canonicalizeSkill, expandImplied, findSkillIds, relatedSkills } from './skillOntology.js';

describe('skill ontology', () => {
  it.each([
    ['GoLang', 'go'],
    ['Golang', 'go'],
    ['Postgres', 'postgresql'],
    ['RESTful APIs', 'rest-api'],
    ['Mongo', 'mongodb'],
    ['K8s', 'kubernetes'],
    ['sklearn', 'scikit-learn'],
    ['Node', 'nodejs'],
    ['C++', 'cpp'],
    ['C#', 'csharp'],
  ])('normalises alias %s to %s', (alias, canonical) => {
    expect(canonicalizeSkill(alias)).toBe(canonical);
  });

  it('does not confuse Java with JavaScript', () => {
    expect(findSkillIds('Built UIs in JavaScript')).not.toContain('java');
    expect(findSkillIds('Backend in Java and Spring Boot')).toEqual(expect.arrayContaining(['java', 'spring-boot']));
  });

  it('prefers the longest alias (React Native over React, Spring Boot over Spring)', () => {
    const ids = findSkillIds('Mobile apps with React Native; APIs with Spring Boot');
    expect(ids).toContain('react-native');
    expect(ids).not.toContain('react');
    expect(ids).toContain('spring-boot');
    expect(ids).not.toContain('spring');
  });

  it('guards the ambiguous word "Go"', () => {
    expect(findSkillIds('We go to market fast and Go to the next step')).not.toContain('go');
    expect(findSkillIds('Wrote microservices in Go.')).toContain('go');
  });

  it('does not treat "rest of the team" as REST', () => {
    expect(findSkillIds('worked with the rest of the team')).not.toContain('rest-api');
  });

  it('expands implied skills transitively', () => {
    const implied = expandImplied(['nextjs']);
    expect(implied.has('react')).toBe(true);
    expect(implied.has('javascript')).toBe(true);
  });

  it('exposes related skills with similarity but never the same skill', () => {
    const related = relatedSkills('postgresql');
    expect(related.find((item) => item.skillId === 'mysql')?.similarity).toBeGreaterThan(0);
    expect(related.some((item) => item.skillId === 'postgresql')).toBe(false);
  });
});
