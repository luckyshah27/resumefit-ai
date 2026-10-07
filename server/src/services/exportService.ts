import PDFDocument from 'pdfkit';
import { AlignmentType, BorderStyle, Document, LevelFormat, Packer, Paragraph, TextRun } from 'docx';
import { classifyHeading } from '../lib/resumeStructurer.js';
import type { AnalysisReport } from '../lib/scoringEngine.js';
import { isBulletLine, stripBullet } from '../utils/text.js';

/**
 * Resume export. The exported document contains exactly the text of the selected version:
 * formatting (headings, bullets, emphasis) is inferred from that text, and nothing is added.
 */

export type ResumeBlock =
  | { kind: 'name'; text: string }
  | { kind: 'contact'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'entry'; text: string }
  | { kind: 'labelled'; label: string; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'paragraph'; text: string };

export const resumeToBlocks = (text: string): ResumeBlock[] => {
  const lines = text.split('\n').map((line) => line.trim());
  const blocks: ResumeBlock[] = [];
  let seenName = false;
  let inHeader = true;

  lines.forEach((line, index) => {
    if (!line) return;
    if (!seenName) {
      blocks.push({ kind: 'name', text: line });
      seenName = true;
      return;
    }
    const heading = classifyHeading(line);
    if (heading && heading.inlineContent === undefined) {
      inHeader = false;
      blocks.push({ kind: 'heading', text: line.replace(/[:\s]+$/, '').toUpperCase() });
      return;
    }
    if (inHeader) {
      blocks.push({ kind: 'contact', text: line });
      return;
    }
    if (isBulletLine(line)) {
      blocks.push({ kind: 'bullet', text: stripBullet(line) });
      return;
    }
    const labelled = line.match(/^([A-Za-z][A-Za-z &/+.-]{1,30}):\s+(.+)$/);
    if (labelled) {
      blocks.push({ kind: 'labelled', label: labelled[1], text: labelled[2] });
      return;
    }
    const next = lines.slice(index + 1).find(Boolean) ?? '';
    // A line introducing bullets (project / internship title) is emphasised.
    blocks.push({ kind: isBulletLine(next) || /^(tech|stack|tools)\b/i.test(next) ? 'entry' : 'paragraph', text: line });
  });
  return blocks;
};

const FONT = 'Calibri';

export const exportResumeDocx = async (text: string): Promise<Buffer> => {
  const children = resumeToBlocks(text).map((block) => {
    switch (block.kind) {
      case 'name':
        return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: block.text, bold: true, size: 36, font: FONT })] });
      case 'contact':
        return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: block.text, size: 19, color: '444444', font: FONT })] });
      case 'heading':
        return new Paragraph({
          spacing: { before: 220, after: 80 },
          border: { bottom: { color: '999999', space: 2, style: BorderStyle.SINGLE, size: 6 } },
          children: [new TextRun({ text: block.text, bold: true, size: 22, font: FONT })],
        });
      case 'entry':
        return new Paragraph({ spacing: { before: 100, after: 30 }, children: [new TextRun({ text: block.text, bold: true, size: 21, font: FONT })] });
      case 'labelled':
        return new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: `${block.label}: `, bold: true, size: 20, font: FONT }), new TextRun({ text: block.text, size: 20, font: FONT })] });
      case 'bullet':
        return new Paragraph({ numbering: { reference: 'resume-bullets', level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text: block.text, size: 20, font: FONT })] });
      default:
        return new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: block.text, size: 20, font: FONT })] });
    }
  });
  const doc = new Document({
    creator: 'RESUMEFIT AI',
    title: 'Resume',
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 220 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children }],
  });
  return Packer.toBuffer(doc);
};

/** pdfkit's standard fonts use WinAnsi encoding; map common symbols and drop what cannot be rendered. */
export const toWinAnsi = (value: string) =>
  value
    .replace(/[→⟶➔]/g, '->')
    .replace(/[←]/g, '<-')
    .replace(/[✓✔]/g, 'v')
    .replace(/[★☆]/g, '*')
    .replace(/[▪◦●○■□➢➤►▶‣∙]/g, '•')
    .replace(/[‐-‒]/g, '-')
    .replace(/[^ -~\u00a0-ÿ–—‘’‚“”„•…€™\n]/g, '');

const collectPdf = (draw: (doc: PDFKit.PDFDocument) => void, title: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 56, right: 56 }, info: { Title: title, Creator: 'RESUMEFIT AI' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });

const rule = (doc: PDFKit.PDFDocument) => {
  const y = doc.y + 1;
  doc.save().moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.6).strokeColor('#9a9a9a').stroke().restore();
  doc.moveDown(0.35);
};

export const exportResumePdf = (text: string): Promise<Buffer> =>
  collectPdf((doc) => {
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    for (const block of resumeToBlocks(text)) {
      const content = toWinAnsi(block.text);
      switch (block.kind) {
        case 'name':
          doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(content, { align: 'center' });
          doc.moveDown(0.2);
          break;
        case 'contact':
          doc.font('Helvetica').fontSize(9.5).fillColor('#444444').text(content, { align: 'center' });
          break;
        case 'heading':
          doc.moveDown(0.7);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(content, { width });
          rule(doc);
          break;
        case 'entry':
          doc.moveDown(0.25);
          doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111111').text(content, { width });
          break;
        case 'labelled':
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${toWinAnsi(block.label)}: `, { continued: true }).font('Helvetica').text(content, { width });
          break;
        case 'bullet':
          doc.font('Helvetica').fontSize(10).fillColor('#222222').text(`•  ${content}`, { width, indent: 10 });
          break;
        default:
          doc.font('Helvetica').fontSize(10).fillColor('#222222').text(content, { width });
      }
    }
  }, 'Resume');

/** Analysis report: scores, the reasons for them, gaps, deductions and top fixes — all copied from the engine output. */
export const exportAnalysisReportPdf = (report: AnalysisReport, meta: { versionNumber: number; createdAt: Date }): Promise<Buffer> =>
  collectPdf((doc) => {
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const h2 = (title: string) => {
      doc.moveDown(0.9);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(toWinAnsi(title), { width });
      rule(doc);
    };
    const line = (value: string, options: { bold?: boolean; color?: string; size?: number } = {}) =>
      doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size ?? 9.5).fillColor(options.color ?? '#222222').text(toWinAnsi(value), { width });

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text('Resume Analysis Report');
    line(`${report.job.role}${report.job.company ? ` - ${report.job.company}` : ''}`, { size: 11, color: '#333333' });
    line(`Resume version ${meta.versionNumber} - analysed ${meta.createdAt.toISOString().slice(0, 10)} - scoring engine ${report.scoringVersion}`, { color: '#666666', size: 9 });

    h2('Scores');
    for (const [label, value] of [
      ['Job Fit', report.scores.jobFit],
      ['ATS Readiness', report.scores.atsReadiness],
      ['Resume Quality', report.scores.resumeQuality],
      ['Interview Readiness', report.scores.interviewReadiness],
    ] as const) {
      line(`${label}: ${value.toFixed(1)} / 100`, { bold: label === 'Job Fit' });
    }
    line(report.summary, { color: '#444444' });

    h2('Why this Job Fit score');
    for (const component of report.jobFit.components.filter((item) => item.applicable)) {
      line(`${component.label}: ${component.earned.toFixed(1)} of ${component.weight.toFixed(1)} points`, { bold: true });
      if (component.summary) line(component.summary, { color: '#444444' });
    }
    line(`Sum of categories = ${report.scores.jobFit.toFixed(1)}.`, { color: '#666666', size: 9 });

    const byState = (states: string[]) => report.jobFit.requirementMatches.filter((match) => states.includes(match.finalMatchState));
    h2('Matched requirements');
    line(byState(['STRONG_MATCH', 'MATCH']).map((match) => match.requirement).join(', ') || 'None');
    h2('Missing or weakly evidenced requirements');
    for (const match of byState(['MISSING', 'PARTIAL_MATCH', 'WEAK_EVIDENCE'])) {
      line(`${match.requirement} (${match.importance.toLowerCase()}): ${match.explanation}`);
    }

    h2('What is costing points (Job Fit)');
    for (const loss of report.costingPoints.jobFit.slice(0, 8)) {
      line(`-${loss.points.toFixed(1)}  ${loss.label}: ${loss.items.map((item) => item.label).join(', ')}`);
    }

    h2('Top fixes');
    const rank = { high: 0, medium: 1, low: 2 };
    for (const fix of [...report.fixes].sort((a, b) => rank[a.confidence] - rank[b.confidence]).slice(0, 8)) {
      line(`${fix.title} (confidence: ${fix.confidence})`, { bold: true });
      if (fix.currentText) line(`Current: ${fix.currentText}`, { color: '#666666' });
      line(`Suggested: ${fix.suggestedText}`, { color: '#333333' });
      line(`Why: ${fix.why}`, { color: '#666666', size: 9 });
      doc.moveDown(0.3);
    }

    doc.moveDown(1);
    line(report.ats.disclaimer, { color: '#777777', size: 8.5 });
    line('Scores are deterministic estimates produced by the RESUMEFIT scoring engine to guide improvement; they are not hiring decisions.', { color: '#777777', size: 8.5 });
  }, 'Resume Analysis Report');
