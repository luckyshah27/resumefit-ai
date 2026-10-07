/**
 * Sentence embeddings with all-MiniLM-L6-v2 (384-d) via transformers.js, running locally on CPU.
 * The model (~23 MB) is downloaded once from the Hugging Face hub and cached on disk.
 */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export type Embedder = (texts: string[]) => Promise<number[][]>;

type FeatureExtractor = (texts: string[], options: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist: () => number[][] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;
const cache = new Map<string, number[]>();

const loadExtractor = () => {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(async ({ pipeline }) => (await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' })) as unknown as FeatureExtractor);
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  return extractorPromise;
};

export const miniLmEmbedder: Embedder = async (texts) => {
  const missing = [...new Set(texts.filter((text) => !cache.has(text)))];
  if (missing.length) {
    const extractor = await loadExtractor();
    for (let start = 0; start < missing.length; start += 32) {
      const batch = missing.slice(start, start + 32);
      const output = await extractor(batch, { pooling: 'mean', normalize: true });
      output.tolist().forEach((vector, index) => cache.set(batch[index], vector));
    }
  }
  return texts.map((text) => cache.get(text)!);
};

/** Vectors are L2-normalised, so cosine similarity is the dot product. */
export const cosineDense = (a: number[], b: number[]) => {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot;
};
