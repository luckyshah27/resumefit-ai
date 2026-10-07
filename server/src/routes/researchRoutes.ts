import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { ExperimentModel } from '../models/Experiment.js';
import { limiters } from '../middleware/rateLimit.js';
import { DATASET, DEFAULT_CONFIG, METHOD_LABELS, runExperiment, type ExperimentConfig } from '../research/experiment.js';

export const researchRouter = Router();
researchRouter.use(authMiddleware, requireDatabase);

const configSchema = z.object({
  name: z.string().max(80).optional(),
  methods: z.array(z.enum(['keyword', 'tfidf', 'embedding', 'ontology'])).min(1).optional(),
  fixedThresholds: z.object({ tfidf: z.number().min(0).max(1), embedding: z.number().min(-1).max(1) }).optional(),
});

let running = false;

researchRouter.get('/dataset', (_req, res) => {
  res.json({
    version: DATASET.version,
    description: DATASET.description,
    labelingGuidelines: DATASET.labelingGuidelines,
    jobs: DATASET.jobs.map((job) => ({ id: job.id, title: job.title, requirements: job.requirements })),
    resumes: DATASET.resumes.map((resume) => ({ id: resume.id, summary: resume.summary })),
    counts: { requirementLabels: DATASET.requirementLabels.length, positives: DATASET.requirementLabels.filter((label) => label.present).length, relevanceLabels: DATASET.relevanceLabels.length },
    methods: METHOD_LABELS,
    defaultConfig: DEFAULT_CONFIG,
  });
});

researchRouter.post(
  '/experiments',
  limiters.research,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = configSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: 'Invalid experiment configuration', errors: parsed.error.flatten() });
    if (running) throw new HttpError(409, 'An experiment is already running. Try again in a few seconds.');
    const config: ExperimentConfig = {
      ...DEFAULT_CONFIG,
      methods: parsed.data.methods ?? DEFAULT_CONFIG.methods,
      fixedThresholds: parsed.data.fixedThresholds ?? DEFAULT_CONFIG.fixedThresholds,
    };
    running = true;
    const started = Date.now();
    try {
      const results = await runExperiment(config);
      const experiment = await ExperimentModel.create({
        userId: req.user!.id,
        name: parsed.data.name || `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        config,
        datasetVersion: DATASET.version,
        results,
        durationMs: Date.now() - started,
      });
      return res.status(201).json(experiment.toObject());
    } finally {
      running = false;
    }
  }),
);

researchRouter.get(
  '/experiments',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const experiments = await ExperimentModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).limit(20).lean();
    return res.json({ experiments });
  }),
);
