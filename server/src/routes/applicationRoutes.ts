import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { asyncHandler, HttpError } from '../middleware/errorHandler.js';
import { APPLICATION_STATUSES, ApplicationModel, type IApplication } from '../models/Application.js';
import { AnalysisModel } from '../models/Analysis.js';
import { limiters } from '../middleware/rateLimit.js';
import { audit } from '../services/auditService.js';

export const applicationRouter = Router();
applicationRouter.use(authMiddleware, requireDatabase);

const baseSchema = z.object({
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  jobDescription: z.string().max(20000).optional(),
  jobUrl: z.string().max(500).optional(),
  location: z.string().max(120).optional(),
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: z.string().max(5000).optional(),
  appliedAt: z.coerce.date().optional(),
  deadline: z.coerce.date().optional(),
  analysisId: z.string().optional(),
});

const serialize = (application: IApplication) => ({
  id: String(application._id),
  company: application.company,
  role: application.role,
  jobDescription: application.jobDescription,
  jobUrl: application.jobUrl,
  location: application.location,
  jobFitScore: application.jobFitScore ?? null,
  analysisId: application.analysisId ? String(application.analysisId) : null,
  resumeVersionId: application.resumeVersionId ? String(application.resumeVersionId) : null,
  resumeVersionNumber: application.resumeVersionNumber ?? null,
  status: application.status,
  statusHistory: application.statusHistory,
  appliedAt: application.appliedAt ?? null,
  deadline: application.deadline ?? null,
  notes: application.notes ?? '',
  createdAt: application.createdAt,
  updatedAt: application.updatedAt,
});

/** Job-fit score and resume version come from the linked analysis, never from client input. */
const linkAnalysis = async (userId: string, analysisId?: string) => {
  if (!analysisId) return {};
  if (!Types.ObjectId.isValid(analysisId)) throw new HttpError(400, 'Invalid analysisId');
  const analysis = await AnalysisModel.findOne({ _id: analysisId, userId }).select('-report');
  if (!analysis) throw new HttpError(404, 'Linked analysis not found');
  return { analysisId: analysis._id, jobFitScore: analysis.scores.jobFit, resumeVersionId: analysis.resumeVersionId, resumeVersionNumber: analysis.versionNumber, jobDescription: analysis.jobDescription };
};

applicationRouter.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const applications = await ApplicationModel.find({ userId: req.user!.id }).sort({ updatedAt: -1 });
    return res.json({ applications: applications.map(serialize) });
  }),
);

applicationRouter.post(
  '/',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = baseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid application', errors: parsed.error.flatten() });
    const { analysisId, ...data } = parsed.data;
    const linked = await linkAnalysis(req.user!.id, analysisId);
    const status = data.status ?? 'SAVED';
    const application = await ApplicationModel.create({
      ...data,
      ...linked,
      jobDescription: data.jobDescription ?? linked.jobDescription,
      userId: req.user!.id,
      status,
      statusHistory: [{ status, at: new Date() }],
      appliedAt: data.appliedAt ?? (status !== 'SAVED' && status !== 'WITHDRAWN' ? new Date() : undefined),
    });
    return res.status(201).json(serialize(application));
  }),
);

applicationRouter.patch(
  '/:id',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = baseSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid application update', errors: parsed.error.flatten() });
    if (!Types.ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Application not found');
    const application = await ApplicationModel.findOne({ _id: req.params.id, userId: req.user!.id });
    if (!application) throw new HttpError(404, 'Application not found');
    const { analysisId, status, ...data } = parsed.data;
    Object.assign(application, data);
    if (analysisId) Object.assign(application, await linkAnalysis(req.user!.id, analysisId));
    if (status && status !== application.status) {
      application.status = status;
      application.statusHistory.push({ status, at: new Date() });
      if (status !== 'SAVED' && status !== 'WITHDRAWN' && !application.appliedAt) application.appliedAt = new Date();
    }
    await application.save();
    return res.json(serialize(application));
  }),
);

applicationRouter.delete(
  '/:id',
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Application not found');
    const result = await ApplicationModel.deleteOne({ _id: req.params.id, userId: req.user!.id });
    if (!result.deletedCount) throw new HttpError(404, 'Application not found');
    audit(req, 'application.delete', { applicationId: req.params.id });
    return res.status(204).end();
  }),
);
