import { describe, expect, it } from 'vitest';
import { exportAnalysisReportPdf, exportResumeDocx, exportResumePdf, resumeToBlocks, toWinAnsi } from './exportService.js';
import { parseResumeFile } from './resumeParser.js';
import { structureResume } from '../lib/resumeStructurer.js';
import { runAnalysis } from '../lib/scoringEngine.js';
import { SAMPLE_JD, SAMPLE_RESUME } from '../test/fixtures.js';
import { stripBullet } from '../utils/text.js';

const words = (text: string) => text.replace(/\s+/g, ' ').trim();

describe('resume export', () => {
  it('maps resume text to blocks without adding or dropping content', () => {
    const blocks = resumeToBlocks(SAMPLE_RESUME);
    expect(blocks[0]).toEqual({ kind: 'name', text: 'Aditi Sharma' });
    expect(blocks.filter((block) => block.kind === 'heading').map((block) => block.text)).toEqual(['SUMMARY', 'EDUCATION', 'TECHNICAL SKILLS', 'EXPERIENCE', 'PROJECTS', 'CERTIFICATIONS', 'ACHIEVEMENTS']);
    expect(blocks.find((block) => block.kind === 'labelled')).toEqual({ kind: 'labelled', label: 'Languages', text: 'JavaScript, TypeScript, Python, Java' });
    expect(blocks.some((block) => block.kind === 'entry' && block.text === 'ShopFlow - E-commerce Dashboard')).toBe(true);
    const original = SAMPLE_RESUME.split('\n').map((line) => stripBullet(line.trim())).filter(Boolean);
    const exported = blocks.map((block) => (block.kind === 'labelled' ? `${block.label}: ${block.text}` : block.text));
    // Every original line survives (headings are only upper-cased).
    for (const line of original) expect(exported.some((text) => text.toLowerCase() === line.toLowerCase())).toBe(true);
    expect(exported.length).toBe(original.length);
  });

  it('round-trips through DOCX with identical structured content', async () => {
    const docx = await exportResumeDocx(SAMPLE_RESUME);
    const parsed = await parseResumeFile(docx, 'export.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const before = structureResume(SAMPLE_RESUME);
    const after = structureResume(parsed.text);
    expect(after.candidate.email).toBe(before.candidate.email);
    expect(after.skills.map((skill) => skill.id).sort()).toEqual(before.skills.map((skill) => skill.id).sort());
    expect(after.projects.map((project) => project.title)).toEqual(before.projects.map((project) => project.title));
  });

  it('round-trips through PDF keeping every line of text', async () => {
    const pdf = await exportResumePdf(SAMPLE_RESUME);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const parsed = await parseResumeFile(pdf, 'export.pdf', 'application/pdf');
    const flat = words(parsed.text);
    for (const line of SAMPLE_RESUME.split('\n').map((value) => stripBullet(value.trim())).filter(Boolean)) {
      expect(flat.toLowerCase()).toContain(words(line).toLowerCase());
    }
    const after = structureResume(parsed.text);
    expect(after.skills.map((skill) => skill.id).sort()).toEqual(structureResume(SAMPLE_RESUME).skills.map((skill) => skill.id).sort());
  });

  it('maps characters the PDF font cannot encode', () => {
    expect(toWinAnsi('React → Node ✓ 😀')).toBe('React -> Node v ');
  });
});

describe('analysis report export', () => {
  it('produces a PDF with scores, gaps and fixes taken from the engine', async () => {
    const report = runAnalysis(SAMPLE_JD, SAMPLE_RESUME);
    const pdf = await exportAnalysisReportPdf(report, { versionNumber: 1, createdAt: new Date('2026-10-07T10:00:00Z') });
    const parsed = await parseResumeFile(pdf, 'report.pdf', 'application/pdf');
    expect(parsed.text).toContain('Resume Analysis Report');
    expect(parsed.text).toContain(`Job Fit: ${report.scores.jobFit.toFixed(1)} / 100`);
    expect(parsed.text).toContain(`ATS Readiness: ${report.scores.atsReadiness.toFixed(1)} / 100`);
    expect(parsed.text).toMatch(/Go \(mandatory\)/);
    expect(parsed.text).toContain('Top fixes');
  });
});
