import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';

/** Renders plain resume text into a real, text-based PDF. */
export const makePdf = (text: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica').fontSize(10);
    text.split('\n').forEach((line) => doc.text(line.length ? line : ' '));
    doc.end();
  });

/** A PDF with only a drawn rectangle and no text (stands in for a scanned/image-only resume). */
export const makeImageOnlyPdf = (): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.rect(50, 50, 400, 600).fill('#cccccc');
    doc.end();
  });

/** Renders plain resume text into a real DOCX; optionally adds a table to exercise ATS risk detection. */
export const makeDocx = async (text: string, options: { withTable?: boolean } = {}): Promise<Buffer> => {
  const paragraphs = text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const children: Array<Paragraph | Table> = [...paragraphs];
  if (options.withTable) {
    children.push(
      new Table({
        rows: [
          new TableRow({ children: [new TableCell({ children: [new Paragraph('Skill')] }), new TableCell({ children: [new Paragraph('Level')] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph('React')] }), new TableCell({ children: [new Paragraph('Advanced')] })] }),
        ],
      }),
    );
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
};
