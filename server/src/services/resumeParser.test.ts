import { describe, expect, it } from 'vitest';
import { parseResumeFile, ResumeParseError, MAX_RESUME_BYTES } from './resumeParser.js';
import { makeDocx, makeImageOnlyPdf, makePdf } from '../test/fileFactory.js';
import { SAMPLE_RESUME } from '../test/fixtures.js';
import { structureResume } from '../lib/resumeStructurer.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(ResumeParseError);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('resume parser', () => {
  it('extracts text and layout signals from a real PDF', async () => {
    const parsed = await parseResumeFile(await makePdf(SAMPLE_RESUME), 'resume.pdf', 'application/pdf');
    expect(parsed.meta).toMatchObject({ fileType: 'pdf', pageCount: 1, tablesDetected: 0 });
    expect(parsed.text).toContain('Aditi Sharma');
    expect(parsed.text).toContain('Software Engineering Intern | CodeSprint Labs');
    const structured = structureResume(parsed.text);
    expect(structured.projects.map((project) => project.title)).toContain('ShopFlow');
    expect(structured.skills.find((skill) => skill.id === 'react')?.evidenceStrength).toBe('HIGH');
  });

  it('extracts text from a real DOCX and detects tables', async () => {
    const parsed = await parseResumeFile(await makeDocx(SAMPLE_RESUME, { withTable: true }), 'resume.docx', DOCX_MIME);
    expect(parsed.meta).toMatchObject({ fileType: 'docx', tablesDetected: 1 });
    expect(structureResume(parsed.text).candidate.email).toBe('aditi.sharma@example.com');
  });

  it('accepts a generic octet-stream MIME when the magic bytes are valid', async () => {
    const parsed = await parseResumeFile(await makeDocx(SAMPLE_RESUME), 'resume.docx', 'application/octet-stream');
    expect(parsed.meta.fileType).toBe('docx');
  });

  it('rejects unsupported extensions', async () => {
    await expectCode(parseResumeFile(Buffer.from('hello world '.repeat(20)), 'resume.txt', 'text/plain'), 'UNSUPPORTED_TYPE');
  });

  it('rejects a MIME type that contradicts the extension', async () => {
    await expectCode(parseResumeFile(await makePdf(SAMPLE_RESUME), 'resume.pdf', 'image/png'), 'MIME_MISMATCH');
  });

  it('rejects files renamed from another format', async () => {
    await expectCode(parseResumeFile(await makeDocx(SAMPLE_RESUME), 'resume.pdf', 'application/pdf'), 'CORRUPTED_FILE');
  });

  it('rejects oversized and empty files', async () => {
    await expectCode(parseResumeFile(Buffer.alloc(MAX_RESUME_BYTES + 1), 'resume.pdf', 'application/pdf'), 'FILE_TOO_LARGE');
    await expectCode(parseResumeFile(Buffer.alloc(10), 'resume.pdf', 'application/pdf'), 'FILE_TOO_SMALL');
  });

  it('reports corrupted PDFs', async () => {
    const pdf = await makePdf(SAMPLE_RESUME);
    await expectCode(parseResumeFile(Buffer.concat([pdf.subarray(0, 300), Buffer.alloc(400, 7)]), 'resume.pdf', 'application/pdf'), 'CORRUPTED_FILE');
  });

  it('reports image-only PDFs instead of analysing empty text', async () => {
    await expectCode(parseResumeFile(await makeImageOnlyPdf(), 'scan.pdf', 'application/pdf'), 'NO_TEXT');
  });
});
