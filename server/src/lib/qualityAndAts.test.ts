import { describe, expect, it } from 'vitest';
import { scoreAtsReadiness } from './atsReadiness.js';
import { scoreResumeQuality } from './resumeQuality.js';
import { analyzeInternship, analyzeProject } from './projectAnalysis.js';
import { structureResume } from './resumeStructurer.js';
import { extractJob } from './jdExtractor.js';
import { textExtractionMeta } from './scoringEngine.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';

const job = extractJob(SAMPLE_JD);
const resume = structureResume(SAMPLE_RESUME);
const meta = textExtractionMeta(SAMPLE_RESUME);

describe('ATS readiness', () => {
  it('scores a clean single-column resume highly', () => {
    const result = scoreAtsReadiness(resume, SAMPLE_RESUME, meta, job);
    expect(result.score).toBeGreaterThan(85);
    expect(result.checks.every((check) => check.weight >= 0)).toBe(true);
    expect(result.disclaimer).toMatch(/best-effort estimate/);
  });

  it('reports potential parsing risks for image-only and table layouts without absolute claims', () => {
    const result = scoreAtsReadiness(resume, SAMPLE_RESUME, { ...meta, fileType: 'pdf', pageCount: 2, charCount: 150, textPerPage: 75, tablesDetected: 2, multiColumnSuspected: true }, job);
    expect(result.score).toBeLessThan(80);
    const messages = result.issues.map((issue) => issue.message).join(' ');
    expect(messages).toMatch(/Potential parsing risk/);
    expect(messages).toMatch(/table/);
    expect(messages).toMatch(/multi-column/);
    expect(messages).not.toMatch(/will be rejected|cannot pass/i);
  });

  it('penalises missing contact info and headings', () => {
    const bare = 'Some Person\nI built things with React and Node.\nMore text about projects and work here to make it longer than two hundred characters in total so the extractability check passes cleanly.';
    const result = scoreAtsReadiness(structureResume(bare), bare, textExtractionMeta(bare), job);
    expect(result.issues.some((issue) => issue.checkId === 'contact')).toBe(true);
    expect(result.issues.some((issue) => issue.checkId === 'headings')).toBe(true);
    expect(result.score).toBeLessThan(50);
  });

  it('gives half credit when the resume uses an alias instead of the JD wording', () => {
    const aliasJob = extractJob('Requirements\n- Strong Postgres skills\n- React');
    const text = 'A B\nSKILLS\nPostgreSQL, React';
    const keywords = scoreAtsReadiness(structureResume(text), text, textExtractionMeta(text), aliasJob).checks.find((check) => check.id === 'keywords')!;
    expect(keywords.ratio).toBe(1);
    const text2 = 'A B\nSKILLS\nPSQL, React';
    const keywords2 = scoreAtsReadiness(structureResume(text2), text2, textExtractionMeta(text2), aliasJob).checks.find((check) => check.id === 'keywords')!;
    expect(keywords2.ratio).toBe(0.75);
  });
});

describe('malformed extraction (2.1.0)', () => {
  it('flags run-together words and letter-spaced headings as potential parsing risks', () => {
    const fused = ['Aditi Sharma', 'EXPERIENCE', Array.from({ length: 6 }, () => 'developedreusablereactcomponentsforthedashboard').join(' '), 'E X P E R I E N C E', 'S K I L L S S E T', 'filler text '.repeat(40)].join('\n');
    const result = scoreAtsReadiness(structureResume(fused), fused, textExtractionMeta(fused), job);
    const messages = result.issues.filter((issue) => issue.checkId === 'extractability').map((issue) => issue.message);
    expect(messages.some((message) => /run-together words/.test(message))).toBe(true);
    expect(messages.some((message) => /letter-spaced/.test(message))).toBe(true);
    expect(result.checks.find((check) => check.id === 'extractability')!.ratio).toBeCloseTo(0.6);
  });
});

describe('project and internship analysis', () => {
  it('scores a detailed project above a thin one', () => {
    const [shopflow, analyzer] = resume.projects.map((project) => analyzeProject(project, job));
    expect(shopflow.overall).toBeGreaterThan(analyzer.overall);
    expect(shopflow.dimensions.map((dimension) => dimension.id)).toEqual(['depth', 'technologies', 'relevance', 'complexity', 'implementation', 'outcome', 'clarity']);
    expect(analyzer.improvements.length).toBeGreaterThan(0);
  });

  it('analyses internships separately with duration and impact', () => {
    const internship = analyzeInternship(resume.internships[0], job);
    expect(internship.durationMonths).toBe(3);
    expect(internship.dimensions.find((dimension) => dimension.id === 'impact')!.score).toBe(10);
  });
});

describe('resume quality', () => {
  const analyses = { projects: resume.projects.map((p) => analyzeProject(p, job)), internships: resume.internships.map((i) => analyzeInternship(i, job)) };

  it('evaluates all nine quality dimensions', () => {
    const result = scoreResumeQuality(resume, SAMPLE_RESUME, analyses, job);
    expect(result.components.map((component) => component.id)).toEqual(['completeness', 'readability', 'specificity', 'projects', 'internships', 'action-verbs', 'outcomes', 'consistency', 'relevance']);
    expect(result.score).toBeGreaterThan(50);
  });

  it('rewards stronger action verbs', () => {
    const before = scoreResumeQuality(resume, SAMPLE_RESUME, analyses, job).components.find((c) => c.id === 'action-verbs')!;
    const improvedText = SAMPLE_RESUME.replace('- Worked on the REST', '- Integrated the REST').replace('- Made a tool', '- Created a tool');
    const improved = structureResume(improvedText);
    const after = scoreResumeQuality(improved, improvedText, analyses, job).components.find((c) => c.id === 'action-verbs')!;
    expect(after.earned).toBeGreaterThan(before.earned);
  });
});
