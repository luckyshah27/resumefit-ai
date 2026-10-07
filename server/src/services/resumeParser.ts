import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { normalizeResumeText } from '../lib/resumeStructurer.js';
import type { ExtractionMeta } from '../lib/types.js';
import { env } from '../config/env.js';
import { logger, timed } from '../observability/logger.js';
import { getFileScanner } from './fileScanner.js';

/** Malware scan hook (ClamAV when configured). Uploaded content is only ever parsed, never executed. */
const scanUpload = async (buffer: Buffer) => {
  const scanner = getFileScanner();
  if (scanner.engine === 'none') return;
  try {
    const result = await timed('upload.scanned', () => scanner.scan(buffer), { engine: scanner.engine });
    if (!result.clean) {
      logger.warn('upload.infected', { signature: result.signature });
      throw new ResumeParseError('INFECTED_FILE', 'This file was flagged by the malware scanner and was not processed.', 422);
    }
  } catch (error) {
    if (error instanceof ResumeParseError) throw error;
    if (env.clamavRequired) throw new ResumeParseError('SCAN_UNAVAILABLE', 'File scanning is temporarily unavailable. Please try again later.', 503);
    logger.warn('upload.scan_skipped', { error: error instanceof Error ? error.message : String(error) });
  }
};

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MIN_RESUME_BYTES = 100;
export const MIN_EXTRACTED_CHARS = 50;

const MIME_BY_EXTENSION = {
  pdf: ['application/pdf', 'application/x-pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

/** Browsers and OSes frequently send this for valid files; we then rely on magic bytes. */
const GENERIC_MIME = ['application/octet-stream', 'binary/octet-stream', ''];

export type ParseErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'MIME_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'FILE_TOO_SMALL'
  | 'CORRUPTED_FILE'
  | 'ENCRYPTED_PDF'
  | 'NO_TEXT'
  | 'INFECTED_FILE'
  | 'SCAN_UNAVAILABLE';

export class ResumeParseError extends Error {
  constructor(public code: ParseErrorCode, message: string, public status = 422) {
    super(message);
    this.name = 'ResumeParseError';
  }
}

export type ParsedResume = { text: string; meta: ExtractionMeta };

const extensionOf = (fileName: string) => fileName.toLowerCase().split('.').pop() ?? '';

const looksLikePdf = (buffer: Buffer) => buffer.subarray(0, 1024).includes('%PDF-');
const looksLikeDocx = (buffer: Buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && buffer.includes('word/document.xml');

export const validateResumeFile = (buffer: Buffer, fileName: string, mimeType = ''): 'pdf' | 'docx' => {
  const extension = extensionOf(fileName);
  if (extension !== 'pdf' && extension !== 'docx') {
    throw new ResumeParseError('UNSUPPORTED_TYPE', `Unsupported file type “.${extension}”. Upload a PDF or DOCX resume.`, 415);
  }
  if (buffer.length > MAX_RESUME_BYTES) {
    throw new ResumeParseError('FILE_TOO_LARGE', `File is ${(buffer.length / 1024 / 1024).toFixed(1)} MB. The maximum size is 5 MB.`, 413);
  }
  if (buffer.length < MIN_RESUME_BYTES) {
    throw new ResumeParseError('FILE_TOO_SMALL', 'The file is empty or too small to be a resume.', 422);
  }
  const allowed: readonly string[] = MIME_BY_EXTENSION[extension];
  const mime = mimeType.toLowerCase();
  if (!allowed.includes(mime) && !GENERIC_MIME.includes(mime)) {
    throw new ResumeParseError('MIME_MISMATCH', `The file extension is .${extension} but the file type reported is “${mimeType}”.`, 415);
  }
  const magicOk = extension === 'pdf' ? looksLikePdf(buffer) : looksLikeDocx(buffer);
  if (!magicOk) {
    throw new ResumeParseError('CORRUPTED_FILE', `The file does not contain valid ${extension.toUpperCase()} data. It may be corrupted or renamed from another format.`, 422);
  }
  return extension;
};

const unusualRatio = (text: string) => {
  if (!text.length) return 0;
  const unusual = text.match(/[\ue000-\uf8ff\ufffd\u0000-\u0008\u000E-\u001F]/g)?.length ?? 0;
  return unusual / text.length;
};

/** Lines where two text runs are separated by a wide gap usually come from side-by-side columns. */
const multiColumnSignal = (rawText: string) => {
  const lines = rawText.split('\n').filter((line) => line.trim().length > 20);
  if (lines.length < 8) return false;
  const gapped = lines.filter((line) => /\S(?:\t+| {4,})\S/.test(line.trim())).length;
  return gapped / lines.length > 0.25;
};

const parsePdf = async (buffer: Buffer, fileName: string): Promise<ParsedResume> => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const rawText = result.pages.map((page) => page.text).join('\n');
    let tablesDetected = 0;
    let imagesDetected = 0;
    const warnings: string[] = [];
    try {
      const tables = await parser.getTable();
      tablesDetected = tables.pages.reduce((total, page) => total + page.tables.filter((table) => table.length > 1 && (table[0]?.length ?? 0) > 1).length, 0);
    } catch {
      warnings.push('Table detection was skipped for this PDF.');
    }
    try {
      const images = await parser.getImage({ imageBuffer: false, imageDataUrl: false, imageThreshold: 40 });
      imagesDetected = images.pages.reduce((total, page) => total + page.images.length, 0);
    } catch {
      warnings.push('Image detection was skipped for this PDF.');
    }
    const text = normalizeResumeText(rawText);
    return {
      text,
      meta: {
        fileType: 'pdf',
        fileName,
        fileSize: buffer.length,
        pageCount: result.total,
        charCount: text.length,
        textPerPage: result.total ? text.length / result.total : text.length,
        tablesDetected,
        imagesDetected,
        multiColumnSuspected: multiColumnSignal(rawText),
        unusualCharRatio: unusualRatio(text),
        warnings,
      },
    };
  } catch (error) {
    if (error instanceof ResumeParseError) throw error;
    const name = (error as Error)?.name ?? '';
    if (/Password/i.test(name) || /password/i.test((error as Error)?.message ?? '')) {
      throw new ResumeParseError('ENCRYPTED_PDF', 'This PDF is password-protected. Remove the password and upload it again.');
    }
    throw new ResumeParseError('CORRUPTED_FILE', 'The PDF could not be read. It may be corrupted; try exporting it again from your editor.');
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Converts mammoth's HTML to plain text. Unlike raw-text extraction this keeps Word list items as
 * "- " bullets, which the structurer relies on to separate entries from their bullet points.
 */
export const docxHtmlToText = (html: string) =>
  html
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|li|tr|table|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (entity, code: string) => {
      if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
      if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/ \| \n/g, '\n');

const parseDocx = async (buffer: Buffer, fileName: string): Promise<ParsedResume> => {
  try {
    const html = await mammoth.convertToHtml({ buffer });
    const text = normalizeResumeText(docxHtmlToText(html.value ?? ''));
    return {
      text,
      meta: {
        fileType: 'docx',
        fileName,
        fileSize: buffer.length,
        charCount: text.length,
        tablesDetected: (html.value.match(/<table/g) ?? []).length,
        imagesDetected: (html.value.match(/<img/g) ?? []).length,
        multiColumnSuspected: false,
        unusualCharRatio: unusualRatio(text),
        warnings: html.messages.filter((message) => message.type === 'error').map((message) => message.message).slice(0, 5),
      },
    };
  } catch {
    throw new ResumeParseError('CORRUPTED_FILE', 'The DOCX file could not be read. It may be corrupted; try re-saving it from Word or Google Docs.');
  }
};

/** Validates and extracts text + layout signals from an uploaded PDF/DOCX resume. */
export const parseResumeFile = async (buffer: Buffer, fileName: string, mimeType = ''): Promise<ParsedResume> => {
  const type = validateResumeFile(buffer, fileName, mimeType);
  await scanUpload(buffer);
  const parsed = await timed('resume.parsed', () => (type === 'pdf' ? parsePdf(buffer, fileName) : parseDocx(buffer, fileName)), { fileType: type, bytes: buffer.length });
  if (parsed.text.replace(/\s/g, '').length < MIN_EXTRACTED_CHARS) {
    throw new ResumeParseError(
      'NO_TEXT',
      'No selectable text was found. This looks like a scanned or image-only resume — most ATS software cannot read it either. Export your resume as a text-based PDF or DOCX.',
    );
  }
  return parsed;
};

/** Backwards-compatible helper used by v1 code paths. */
export const extractTextFromResume = async (fileBuffer: Buffer, fileName: string): Promise<string> => (await parseResumeFile(fileBuffer, fileName)).text;
