/** Writes demo inputs to ./samples: a text-based PDF and DOCX resume plus a matching job description. */
import fs from 'node:fs';
import path from 'node:path';
import { makeDocx, makePdf } from '../src/test/fileFactory.js';
import { DEMO_BACKEND_JD, SAMPLE_JD, SAMPLE_RESUME } from '../src/test/fixtures.js';

const out = path.resolve(process.cwd(), '..', 'samples');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'sample-resume.pdf'), await makePdf(SAMPLE_RESUME));
fs.writeFileSync(path.join(out, 'sample-resume.docx'), await makeDocx(SAMPLE_RESUME));
fs.writeFileSync(path.join(out, 'sample-job-description.txt'), DEMO_BACKEND_JD);
fs.writeFileSync(path.join(out, 'sample-job-description-fullstack.txt'), SAMPLE_JD);
console.log(`Sample files written to ${out}`);
