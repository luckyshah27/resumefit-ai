/**
 * Runs the research experiment with the default configuration and writes machine-readable results to
 * ../research/results.json. Results are computed, never edited by hand: re-run this script to regenerate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATASET, DEFAULT_CONFIG, runExperiment } from '../src/research/experiment.js';
import { SCORING_VERSION } from '../src/lib/scoringEngine.js';

const started = Date.now();
const results = await runExperiment(DEFAULT_CONFIG);
const outDir = path.resolve(process.cwd(), '..', 'research');
fs.mkdirSync(outDir, { recursive: true });

const output = {
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  scoringVersion: SCORING_VERSION,
  datasetVersion: DATASET.version,
  config: DEFAULT_CONFIG,
  results,
};
fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(output, null, 2)}\n`);

const pct = (value: number) => (value * 100).toFixed(1);
for (const row of results.classification) {
  // Plain console output is intended here: this is a CLI script.
  console.log(`${row.label.padEnd(36)} ${row.mode.padEnd(16)} P ${pct(row.metrics.precision)}  R ${pct(row.metrics.recall)}  F1 ${pct(row.metrics.f1)}  CI ${pct(row.f1Ci95.low)}–${pct(row.f1Ci95.high)}`);
}
for (const row of results.ranking) {
  console.log(`${row.label.padEnd(36)} nDCG@3 ${row.ndcg['@3'].toFixed(3)}  nDCG@5 ${row.ndcg['@5'].toFixed(3)}  P@2 ${row.precisionAtK.toFixed(3)}  MRR ${row.mrr.toFixed(3)}  MAP ${row.map.toFixed(3)}`);
}
if (results.unavailable.length) console.log('Unavailable:', results.unavailable);
console.log(`Wrote ${path.join(outDir, 'results.json')}`);
