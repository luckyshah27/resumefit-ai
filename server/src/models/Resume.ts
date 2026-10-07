import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { ExtractionMeta } from '../lib/types.js';

/** A resume "family": all versions of one resume belong to it. */
export interface IResume {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  latestVersionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export type VersionChange = {
  id: string;
  type?: string;
  operation: string;
  before: string | null;
  after: string;
  applied: boolean;
  reason?: string;
  confirmedByUser?: boolean;
};

export type VersionBreakdown = {
  jobFit: Array<{ id: string; label: string; weight: number; earned: number }>;
  atsReadiness: Array<{ id: string; label: string; weight: number; earned: number }>;
  resumeQuality: Array<{ id: string; label: string; weight: number; earned: number }>;
};

/**
 * One immutable snapshot of resume content. Content, lineage and change log can never be updated
 * (Mongoose `immutable`); the score snapshot is written once, by the analysis that created the version.
 * Later analyses of the same version against other jobs are separate Analysis documents.
 */
export interface IResumeVersion {
  _id: Types.ObjectId;
  resumeId: Types.ObjectId;
  userId: Types.ObjectId;
  versionNumber: number;
  label: string;
  text: string;
  source: 'upload' | 'paste' | 'fix' | 'edit' | 'restore';
  fileName?: string;
  extraction: ExtractionMeta;
  parentVersionId?: Types.ObjectId;
  restoredFromVersion?: number;
  changes: VersionChange[];
  job?: { role: string; company?: string; jobDescription: string };
  scores?: { jobFit: number; atsReadiness: number; resumeQuality: number; interviewReadiness: number };
  breakdown?: VersionBreakdown;
  scoringVersion?: string;
  analysisId?: Types.ObjectId;
  createdAt: Date;
}

const ResumeSchema = new Schema<IResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    latestVersionNumber: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const ResumeVersionSchema = new Schema<IResumeVersion>(
  {
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
    versionNumber: { type: Number, required: true, immutable: true },
    label: { type: String, default: '', immutable: true },
    text: { type: String, required: true, immutable: true },
    source: { type: String, enum: ['upload', 'paste', 'fix', 'edit', 'restore'], required: true, immutable: true },
    fileName: { type: String, immutable: true },
    extraction: { type: Schema.Types.Mixed, required: true, immutable: true },
    parentVersionId: { type: Schema.Types.ObjectId, ref: 'ResumeVersion', immutable: true },
    restoredFromVersion: { type: Number, immutable: true },
    changes: { type: Schema.Types.Mixed, default: () => [], immutable: true },
    job: { role: String, company: String, jobDescription: String },
    scores: { jobFit: Number, atsReadiness: Number, resumeQuality: Number, interviewReadiness: Number },
    breakdown: Schema.Types.Mixed,
    scoringVersion: String,
    analysisId: { type: Schema.Types.ObjectId, ref: 'Analysis' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
ResumeVersionSchema.index({ resumeId: 1, versionNumber: 1 }, { unique: true });

export const ResumeModel: Model<IResume> = mongoose.models.Resume || mongoose.model<IResume>('Resume', ResumeSchema);
export const ResumeVersionModel: Model<IResumeVersion> = mongoose.models.ResumeVersion || mongoose.model<IResumeVersion>('ResumeVersion', ResumeVersionSchema);
