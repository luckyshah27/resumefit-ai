import { describe, expect, it } from 'vitest';
import { averagePrecision, bootstrapF1, classificationMetrics, ndcgAtK, precisionAtK, reciprocalRank } from './metrics.js';
import { TfIdfVectorizer, cosineSparse } from './tfidf.js';
import { DATASET, DEFAULT_CONFIG, keywordPresent, ontologyPresent, resumeUnits, runExperiment } from './experiment.js';
import type { Embedder } from './embeddings.js';

describe('metrics', () => {
  it('computes precision, recall and F1 from a confusion matrix', () => {
    const metrics = classificationMetrics([true, true, false, false, true], [true, false, true, false, true]);
    expect(metrics).toMatchObject({ tp: 2, fp: 1, fn: 1, tn: 1 });
    expect(metrics.precision).toBeCloseTo(2 / 3);
    expect(metrics.recall).toBeCloseTo(2 / 3);
    expect(metrics.f1).toBeCloseTo(2 / 3);
  });

  it('computes ranking metrics', () => {
    expect(ndcgAtK([2, 1, 0], 3)).toBe(1);
    expect(ndcgAtK([0, 1, 2], 3)).toBeLessThan(1);
    expect(precisionAtK([true, false, true], 2)).toBe(0.5);
    expect(reciprocalRank([false, false, true])).toBeCloseTo(1 / 3);
    expect(averagePrecision([true, false, true])).toBeCloseTo((1 + 2 / 3) / 2);
  });

  it('produces reproducible bootstrap intervals', () => {
    const predictions = [true, false, true, true, false, true];
    const labels = [true, false, false, true, true, true];
    expect(bootstrapF1(predictions, labels, 200, 7)).toEqual(bootstrapF1(predictions, labels, 200, 7));
  });
});

describe('TF-IDF', () => {
  it('scores related text higher than unrelated text', () => {
    const vectorizer = new TfIdfVectorizer().fit(['postgres database queries', 'react user interface', 'docker containers']);
    const query = vectorizer.transform('postgres queries');
    expect(cosineSparse(query, vectorizer.transform('optimised postgres queries'))).toBeGreaterThan(cosineSparse(query, vectorizer.transform('react interface')));
  });
});

describe('methods', () => {
  it('keyword baseline requires literal tokens; ontology handles aliases', () => {
    expect(keywordPresent('PostgreSQL', 'Skills: Postgres, Redis')).toBe(false);
    expect(ontologyPresent('PostgreSQL', 'Skills: Postgres, Redis', new Set(['postgresql', 'redis']))).toBe(true);
    expect(keywordPresent('HTML and CSS', 'HTML, CSS, JavaScript')).toBe(true);
  });

  it('splits resumes into line and list-item units', () => {
    expect(resumeUnits('SKILLS\nLanguages: Go, Python\n- Built APIs')).toEqual(expect.arrayContaining(['Languages: Go, Python', 'Go', 'Python', 'Built APIs']));
  });
});

describe('experiment runner', () => {
  // A deterministic stand-in embedder (character-trigram hashing) so the test runs offline.
  const fakeEmbedder: Embedder = async (texts) =>
    texts.map((text) => {
      const vector = new Array(64).fill(0);
      const lower = text.toLowerCase();
      for (let i = 0; i < lower.length - 2; i += 1) vector[(lower.charCodeAt(i) * 31 + lower.charCodeAt(i + 1) * 7 + lower.charCodeAt(i + 2)) % 64] += 1;
      const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
      return vector.map((value) => value / norm);
    });

  it('evaluates every method on the full labelled dataset', async () => {
    const results = await runExperiment(DEFAULT_CONFIG, fakeEmbedder);
    expect(results.dataset).toMatchObject({ jobs: DATASET.jobs.length, resumes: DATASET.resumes.length, requirementExamples: DATASET.requirementLabels.length });
    const methods = results.classification.map((row) => `${row.method}:${row.mode}`);
    expect(methods).toEqual(expect.arrayContaining(['keyword:direct', 'ontology:direct', 'tfidf:fixed-threshold', 'tfidf:cross-validated', 'embedding:cross-validated']));
    for (const row of results.classification) {
      expect(row.metrics.tp + row.metrics.fp + row.metrics.fn + row.metrics.tn).toBe(DATASET.requirementLabels.length);
      expect(row.metrics.f1).toBeGreaterThanOrEqual(0);
      expect(row.f1Ci95.low).toBeLessThanOrEqual(row.f1Ci95.high);
    }
    expect(results.ranking.map((row) => row.method)).toEqual(expect.arrayContaining(['keyword', 'tfidf-doc', 'embedding-req', 'ontology-jobfit']));
    expect(results.unavailable).toEqual([]);
  }, 60000);

  it('reports an unavailable embedding model instead of faking results', async () => {
    const failing: Embedder = async () => {
      throw new Error('offline');
    };
    const results = await runExperiment({ ...DEFAULT_CONFIG, methods: ['keyword', 'embedding'] }, failing);
    expect(results.unavailable).toEqual([{ method: 'embedding', reason: expect.stringContaining('offline') }]);
    expect(results.classification.some((row) => row.method === 'embedding')).toBe(false);
  });
});
