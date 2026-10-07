/** Evaluation metrics. All functions are pure and deterministic. */

export type Confusion = { tp: number; fp: number; fn: number; tn: number };

export type ClassificationMetrics = Confusion & { precision: number; recall: number; f1: number; accuracy: number; support: number };

export const confusion = (predictions: boolean[], labels: boolean[]): Confusion => {
  const result = { tp: 0, fp: 0, fn: 0, tn: 0 };
  predictions.forEach((prediction, index) => {
    const label = labels[index];
    if (prediction && label) result.tp += 1;
    else if (prediction && !label) result.fp += 1;
    else if (!prediction && label) result.fn += 1;
    else result.tn += 1;
  });
  return result;
};

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

export const classificationMetrics = (predictions: boolean[], labels: boolean[]): ClassificationMetrics => {
  const c = confusion(predictions, labels);
  const precision = safeDiv(c.tp, c.tp + c.fp);
  const recall = safeDiv(c.tp, c.tp + c.fn);
  const f1 = safeDiv(2 * precision * recall, precision + recall);
  return { ...c, precision, recall, f1, accuracy: safeDiv(c.tp + c.tn, predictions.length), support: labels.filter(Boolean).length };
};

/** Graded nDCG@k with gain 2^rel - 1. `ranked` is the list of relevance grades in predicted order. */
export const ndcgAtK = (rankedRelevance: number[], k: number): number => {
  const dcg = (values: number[]) => values.slice(0, k).reduce((total, rel, index) => total + (2 ** rel - 1) / Math.log2(index + 2), 0);
  const ideal = dcg([...rankedRelevance].sort((a, b) => b - a));
  return ideal === 0 ? 0 : dcg(rankedRelevance) / ideal;
};

export const precisionAtK = (rankedRelevant: boolean[], k: number) => safeDiv(rankedRelevant.slice(0, k).filter(Boolean).length, Math.min(k, rankedRelevant.length));

export const reciprocalRank = (rankedRelevant: boolean[]) => {
  const index = rankedRelevant.findIndex(Boolean);
  return index === -1 ? 0 : 1 / (index + 1);
};

export const averagePrecision = (rankedRelevant: boolean[]) => {
  const totalRelevant = rankedRelevant.filter(Boolean).length;
  if (totalRelevant === 0) return 0;
  let hits = 0;
  let sum = 0;
  rankedRelevant.forEach((relevant, index) => {
    if (relevant) {
      hits += 1;
      sum += hits / (index + 1);
    }
  });
  return sum / totalRelevant;
};

/** Ranks items by score descending; ties broken by id for determinism. */
export const rankBy = <T extends { id: string; score: number }>(items: T[]) => [...items].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

/** Mulberry32 PRNG — seeded so bootstrap intervals are reproducible. */
export const seededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Percentile bootstrap 95% CI of F1 over requirement-level examples. */
export const bootstrapF1 = (predictions: boolean[], labels: boolean[], iterations = 1000, seed = 42) => {
  const random = seededRandom(seed);
  const n = predictions.length;
  const values: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const p: boolean[] = [];
    const l: boolean[] = [];
    for (let j = 0; j < n; j += 1) {
      const index = Math.floor(random() * n);
      p.push(predictions[index]);
      l.push(labels[index]);
    }
    values.push(classificationMetrics(p, l).f1);
  }
  values.sort((a, b) => a - b);
  return { low: values[Math.floor(0.025 * iterations)], high: values[Math.floor(0.975 * iterations)] };
};

export const mean = (values: number[]) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);
