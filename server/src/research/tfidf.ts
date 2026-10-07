import { STOPWORDS, stem, tokenize } from '../utils/text.js';

export type SparseVector = Map<string, number>;

/** Unigram + bigram terms over stemmed, stopword-filtered tokens. */
export const terms = (text: string): string[] => {
  const tokens = tokenize(text)
    .filter((token) => !STOPWORDS.has(token))
    .map(stem);
  const bigrams = tokens.slice(1).map((token, index) => `${tokens[index]}_${token}`);
  return [...tokens, ...bigrams];
};

/** Classic TF-IDF with smoothed IDF and L2 normalisation (as in scikit-learn's defaults). */
export class TfIdfVectorizer {
  private idf = new Map<string, number>();
  private documentCount = 0;

  fit(documents: string[]) {
    this.documentCount = documents.length;
    const documentFrequency = new Map<string, number>();
    for (const document of documents) {
      for (const term of new Set(terms(document))) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
    documentFrequency.forEach((df, term) => this.idf.set(term, Math.log((1 + this.documentCount) / (1 + df)) + 1));
    return this;
  }

  transform(text: string): SparseVector {
    const counts = new Map<string, number>();
    for (const term of terms(text)) counts.set(term, (counts.get(term) ?? 0) + 1);
    const vector: SparseVector = new Map();
    let norm = 0;
    counts.forEach((count, term) => {
      // Unseen terms get the maximum IDF (they are rare by definition).
      const weight = count * (this.idf.get(term) ?? Math.log(1 + this.documentCount) + 1);
      vector.set(term, weight);
      norm += weight * weight;
    });
    norm = Math.sqrt(norm);
    if (norm > 0) vector.forEach((value, term) => vector.set(term, value / norm));
    return vector;
  }
}

export const cosineSparse = (a: SparseVector, b: SparseVector) => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  small.forEach((value, term) => {
    const other = large.get(term);
    if (other !== undefined) dot += value * other;
  });
  return dot;
};
