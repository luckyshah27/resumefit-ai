import dataset from './dataset/evaluationDataset.json' with { type: 'json' };
import { TfIdfVectorizer, cosineSparse } from './tfidf.js';
import { EMBEDDING_MODEL, cosineDense, miniLmEmbedder, type Embedder } from './embeddings.js';
import { averagePrecision, bootstrapF1, classificationMetrics, mean, ndcgAtK, precisionAtK, rankBy, reciprocalRank, type ClassificationMetrics } from './metrics.js';
import { findSkillMentions } from '../lib/skillOntology.js';
import { structureResume } from '../lib/resumeStructurer.js';
import { runAnalysis } from '../lib/scoringEngine.js';
import { STOPWORDS, stripBullet, tokenize, unique } from '../utils/text.js';

export type EvaluationDataset = {
  version: string;
  description: string;
  labelingGuidelines: string[];
  jobs: Array<{ id: string; title: string; text: string; requirements: Array<{ id: string; phrase: string; importance: 'mandatory' | 'preferred' }> }>;
  resumes: Array<{ id: string; summary: string; groundTruthSkills: string[]; text: string }>;
  requirementLabels: Array<{ jobId: string; requirementId: string; resumeId: string; present: boolean }>;
  relevanceLabels: Array<{ jobId: string; resumeId: string; relevance: number }>;
};

export const DATASET = dataset as EvaluationDataset;

export type MethodId = 'keyword' | 'tfidf' | 'embedding' | 'ontology';

export const METHOD_LABELS: Record<MethodId, string> = {
  keyword: 'A. Keyword matching',
  tfidf: 'B. TF-IDF similarity',
  embedding: 'C. Semantic embeddings (MiniLM)',
  ontology: 'RESUMEFIT ontology engine',
};

export type ExperimentConfig = {
  methods: MethodId[];
  fixedThresholds: { tfidf: number; embedding: number };
  thresholdGrid: number[];
  ranking: { ndcgK: number[]; precisionK: number; relevantGrade: number; preferredWeight: number };
  bootstrap: { iterations: number; seed: number };
};

export const DEFAULT_CONFIG: ExperimentConfig = {
  methods: ['keyword', 'tfidf', 'embedding', 'ontology'],
  fixedThresholds: { tfidf: 0.35, embedding: 0.6 },
  thresholdGrid: Array.from({ length: 19 }, (_, index) => Math.round((0.05 + index * 0.05) * 100) / 100),
  ranking: { ndcgK: [3, 5], precisionK: 2, relevantGrade: 2, preferredWeight: 0.5 },
  bootstrap: { iterations: 1000, seed: 42 },
};

type Example = { jobId: string; requirementId: string; phrase: string; importance: string; resumeId: string; label: boolean };

/** Resume "units": lines plus comma-separated segments, so a single skill can match a skills-list item. */
export const resumeUnits = (text: string) =>
  unique(
    text
      .split('\n')
      .map((line) => stripBullet(line).trim())
      .filter((line) => line.length > 1)
      .flatMap((line) => [line, ...(line.includes(',') ? line.replace(/^[^:]{1,30}:/, '').split(/[,;]/).map((part) => part.replace(/[()]/g, ' ').trim()) : [])])
      .filter((unit) => unit.length > 1),
  );

/** A. Keyword baseline: every non-stopword token of the requirement appears verbatim as a resume token. */
export const keywordPresent = (phrase: string, resumeText: string) => {
  const resumeTokens = new Set(tokenize(resumeText));
  const phraseTokens = tokenize(phrase).filter((token) => !STOPWORDS.has(token));
  return phraseTokens.length > 0 && phraseTokens.every((token) => resumeTokens.has(token));
};

/** Ontology method: canonicalise the requirement, check the structured resume (aliases + implications). */
export const ontologyPresent = (phrase: string, resumeText: string, resumeSkills: Set<string>) => {
  const ids = unique(findSkillMentions(phrase).map((mention) => mention.skillId));
  if (ids.length === 0) return keywordPresent(phrase, resumeText);
  return ids.every((id) => resumeSkills.has(id));
};

const bestThreshold = (scores: number[], labels: boolean[], grid: number[]) => {
  let best = { threshold: grid[0], f1: -1 };
  for (const threshold of grid) {
    const f1 = classificationMetrics(scores.map((score) => score >= threshold), labels).f1;
    if (f1 > best.f1) best = { threshold, f1 };
  }
  return best.threshold;
};

export type ClassificationResult = {
  method: MethodId;
  label: string;
  mode: 'direct' | 'fixed-threshold' | 'cross-validated';
  thresholds?: Record<string, number> | number;
  metrics: ClassificationMetrics;
  f1Ci95: { low: number; high: number };
  byImportance: { mandatory: ClassificationMetrics; preferred: ClassificationMetrics };
};

export type RankingResult = {
  method: string;
  label: string;
  ndcg: Record<string, number>;
  precisionAtK: number;
  mrr: number;
  map: number;
  perJob: Array<{ jobId: string; ranking: Array<{ resumeId: string; score: number; relevance: number }>; ndcg3: number }>;
};

export type ExperimentResults = {
  dataset: { version: string; description: string; jobs: number; resumes: number; requirementExamples: number; positives: number; relevancePairs: number };
  classification: ClassificationResult[];
  ranking: RankingResult[];
  thresholdSweep: Record<string, Array<{ threshold: number; precision: number; recall: number; f1: number }>>;
  errors: Record<string, Array<{ jobId: string; phrase: string; resumeId: string; label: boolean; predicted: boolean; score: number }>>;
  unavailable: Array<{ method: MethodId; reason: string }>;
  notes: string[];
  embeddingModel: string;
};

export const runExperiment = async (config: ExperimentConfig = DEFAULT_CONFIG, embed: Embedder = miniLmEmbedder, data: EvaluationDataset = DATASET): Promise<ExperimentResults> => {
  const resumes = new Map(data.resumes.map((resume) => [resume.id, resume]));
  const labelIndex = new Map(data.requirementLabels.map((label) => [`${label.jobId}|${label.requirementId}|${label.resumeId}`, label.present]));
  const relevanceIndex = new Map(data.relevanceLabels.map((label) => [`${label.jobId}|${label.resumeId}`, label.relevance]));

  const examples: Example[] = data.jobs.flatMap((job) =>
    job.requirements.flatMap((req) =>
      data.resumes.map((resume) => {
        const label = labelIndex.get(`${job.id}|${req.id}|${resume.id}`);
        if (label === undefined) throw new Error(`Missing label for ${job.id}/${req.id}/${resume.id}`);
        return { jobId: job.id, requirementId: req.id, phrase: req.phrase, importance: req.importance, resumeId: resume.id, label };
      }),
    ),
  );
  const labels = examples.map((example) => example.label);

  const units = new Map(data.resumes.map((resume) => [resume.id, resumeUnits(resume.text)]));
  const structuredSkills = new Map(data.resumes.map((resume) => [resume.id, new Set(structureResume(resume.text).skills.map((skill) => skill.id))]));
  const unavailable: ExperimentResults['unavailable'] = [];
  const scores: Partial<Record<MethodId, number[]>> = {};

  if (config.methods.includes('keyword')) scores.keyword = examples.map((example) => (keywordPresent(example.phrase, resumes.get(example.resumeId)!.text) ? 1 : 0));
  if (config.methods.includes('ontology')) scores.ontology = examples.map((example) => (ontologyPresent(example.phrase, resumes.get(example.resumeId)!.text, structuredSkills.get(example.resumeId)!) ? 1 : 0));

  const vectorizer = new TfIdfVectorizer().fit([...data.resumes.flatMap((resume) => units.get(resume.id)!), ...data.jobs.map((job) => job.text), ...data.resumes.map((resume) => resume.text)]);
  const tfidfUnitVectors = new Map(data.resumes.map((resume) => [resume.id, units.get(resume.id)!.map((unit) => vectorizer.transform(unit))]));
  if (config.methods.includes('tfidf')) {
    scores.tfidf = examples.map((example) => {
      const query = vectorizer.transform(example.phrase);
      return Math.max(0, ...tfidfUnitVectors.get(example.resumeId)!.map((vector) => cosineSparse(query, vector)));
    });
  }

  let embeddingIndex: Map<string, number[]> | null = null;
  if (config.methods.includes('embedding')) {
    try {
      const texts = unique([...examples.map((example) => example.phrase), ...[...units.values()].flat(), ...data.jobs.map((job) => job.text), ...data.resumes.map((resume) => resume.text)]);
      const vectors = await embed(texts);
      embeddingIndex = new Map(texts.map((text, index) => [text, vectors[index]]));
      scores.embedding = examples.map((example) => {
        const query = embeddingIndex!.get(example.phrase)!;
        return Math.max(-1, ...units.get(example.resumeId)!.map((unit) => cosineDense(query, embeddingIndex!.get(unit)!)));
      });
    } catch (error) {
      unavailable.push({ method: 'embedding', reason: `Embedding model could not be loaded: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  const classification: ClassificationResult[] = [];
  const errors: ExperimentResults['errors'] = {};
  const subset = (predictions: boolean[], importance: string) => {
    const indices = examples.map((example, index) => (example.importance === importance ? index : -1)).filter((index) => index >= 0);
    return classificationMetrics(indices.map((index) => predictions[index]), indices.map((index) => labels[index]));
  };
  const record = (method: MethodId, mode: ClassificationResult['mode'], predictions: boolean[], thresholds?: ClassificationResult['thresholds']) => {
    classification.push({
      method,
      label: METHOD_LABELS[method],
      mode,
      thresholds,
      metrics: classificationMetrics(predictions, labels),
      f1Ci95: bootstrapF1(predictions, labels, config.bootstrap.iterations, config.bootstrap.seed),
      byImportance: { mandatory: subset(predictions, 'mandatory'), preferred: subset(predictions, 'preferred') },
    });
    if (mode !== 'fixed-threshold') {
      errors[method] = examples
        .map((example, index) => ({ jobId: example.jobId, phrase: example.phrase, resumeId: example.resumeId, label: example.label, predicted: predictions[index], score: Math.round((scores[method]![index] ?? 0) * 1000) / 1000 }))
        .filter((item) => item.label !== item.predicted)
        .slice(0, 25);
    }
  };

  for (const method of ['keyword', 'ontology'] as const) {
    if (scores[method]) record(method, 'direct', scores[method]!.map((score) => score >= 0.5));
  }

  const thresholdSweep: ExperimentResults['thresholdSweep'] = {};
  for (const method of ['tfidf', 'embedding'] as const) {
    const methodScores = scores[method];
    if (!methodScores) continue;
    // Fixed threshold declared in the config.
    record(method, 'fixed-threshold', methodScores.map((score) => score >= config.fixedThresholds[method]), config.fixedThresholds[method]);
    // Leave-one-job-out CV: threshold chosen on the other jobs, applied to the held-out job.
    const predictions = new Array<boolean>(examples.length).fill(false);
    const chosen: Record<string, number> = {};
    for (const job of data.jobs) {
      const train = examples.map((example, index) => ({ example, index })).filter(({ example }) => example.jobId !== job.id);
      const threshold = bestThreshold(train.map(({ index }) => methodScores[index]), train.map(({ index }) => labels[index]), config.thresholdGrid);
      chosen[job.id] = threshold;
      examples.forEach((example, index) => {
        if (example.jobId === job.id) predictions[index] = methodScores[index] >= threshold;
      });
    }
    record(method, 'cross-validated', predictions, chosen);
    thresholdSweep[method] = config.thresholdGrid.map((threshold) => {
      const metrics = classificationMetrics(methodScores.map((score) => score >= threshold), labels);
      return { threshold, precision: metrics.precision, recall: metrics.recall, f1: metrics.f1 };
    });
  }

  // Ranking: for every job, rank all resumes.
  const rankingMethods: Array<{ id: string; label: string; score: (jobIndex: number, resumeId: string) => number }> = [];
  const requirementAggregate = (method: MethodId) => (jobIndex: number, resumeId: string) => {
    const job = data.jobs[jobIndex];
    let total = 0;
    let weights = 0;
    job.requirements.forEach((req) => {
      const index = examples.findIndex((example) => example.jobId === job.id && example.requirementId === req.id && example.resumeId === resumeId);
      const weight = req.importance === 'mandatory' ? 1 : config.ranking.preferredWeight;
      total += weight * scores[method]![index];
      weights += weight;
    });
    return weights ? total / weights : 0;
  };
  if (scores.keyword) rankingMethods.push({ id: 'keyword', label: 'A. Keyword coverage', score: requirementAggregate('keyword') });
  if (config.methods.includes('tfidf')) {
    rankingMethods.push({ id: 'tfidf-doc', label: 'B. TF-IDF (JD ↔ resume)', score: (jobIndex, resumeId) => cosineSparse(vectorizer.transform(data.jobs[jobIndex].text), vectorizer.transform(resumes.get(resumeId)!.text)) });
    rankingMethods.push({ id: 'tfidf-req', label: 'B. TF-IDF (per requirement)', score: requirementAggregate('tfidf') });
  }
  if (embeddingIndex) {
    const index = embeddingIndex;
    rankingMethods.push({ id: 'embedding-doc', label: 'C. Embeddings (JD ↔ resume)', score: (jobIndex, resumeId) => cosineDense(index.get(data.jobs[jobIndex].text)!, index.get(resumes.get(resumeId)!.text)!) });
    rankingMethods.push({ id: 'embedding-req', label: 'C. Embeddings (per requirement)', score: requirementAggregate('embedding') });
  }
  if (config.methods.includes('ontology')) {
    const jobFitCache = new Map<string, number>();
    rankingMethods.push({
      id: 'ontology-jobfit',
      label: 'RESUMEFIT Job Fit score',
      score: (jobIndex, resumeId) => {
        const key = `${jobIndex}|${resumeId}`;
        if (!jobFitCache.has(key)) jobFitCache.set(key, runAnalysis(data.jobs[jobIndex].text, resumes.get(resumeId)!.text).scores.jobFit);
        return jobFitCache.get(key)!;
      },
    });
  }

  const ranking: RankingResult[] = rankingMethods.map((method) => {
    const perJob = data.jobs.map((job, jobIndex) => {
      const ranked = rankBy(data.resumes.map((resume) => ({ id: resume.id, score: method.score(jobIndex, resume.id) })));
      return {
        jobId: job.id,
        ranking: ranked.map((item) => ({ resumeId: item.id, score: Math.round(item.score * 1000) / 1000, relevance: relevanceIndex.get(`${job.id}|${item.id}`) ?? 0 })),
      };
    });
    const relevance = perJob.map((job) => job.ranking.map((item) => item.relevance));
    const relevant = relevance.map((grades) => grades.map((grade) => grade >= config.ranking.relevantGrade));
    return {
      method: method.id,
      label: method.label,
      ndcg: Object.fromEntries(config.ranking.ndcgK.map((k) => [`@${k}`, mean(relevance.map((grades) => ndcgAtK(grades, k)))])),
      precisionAtK: mean(relevant.map((flags) => precisionAtK(flags, config.ranking.precisionK))),
      mrr: mean(relevant.map(reciprocalRank)),
      map: mean(relevant.map(averagePrecision)),
      perJob: perJob.map((job, index) => ({ ...job, ndcg3: ndcgAtK(relevance[index], 3) })),
    };
  });

  return {
    dataset: {
      version: data.version,
      description: data.description,
      jobs: data.jobs.length,
      resumes: data.resumes.length,
      requirementExamples: examples.length,
      positives: labels.filter(Boolean).length,
      relevancePairs: data.relevanceLabels.length,
    },
    classification,
    ranking,
    thresholdSweep,
    errors,
    unavailable,
    embeddingModel: EMBEDDING_MODEL,
    notes: [
      'Requirement detection: each (JD requirement, resume) pair is a binary example; precision/recall/F1 are computed over all pairs.',
      'TF-IDF and embedding scores are the maximum cosine similarity between the requirement phrase and any resume line or comma-separated segment.',
      'Cross-validated rows choose the threshold on five jobs and evaluate on the held-out sixth (leave-one-job-out), so no threshold is tuned on the data it is scored on. Fixed-threshold rows use the thresholds declared in the configuration.',
      `Ranking: each job ranks all ${data.resumes.length} resumes; nDCG uses graded relevance (0/1/2); P@k, MRR and MAP treat relevance ≥ ${config.ranking.relevantGrade} as relevant.`,
      'The 95% interval is a seeded percentile bootstrap over requirement examples.',
      'The dataset is small and synthetic, so results show relative behaviour, not production accuracy. The ontology was written before the dataset, but by the same author.',
    ],
  };
};
