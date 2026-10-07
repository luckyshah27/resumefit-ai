import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { AnalysisReport } from '../lib/scoringEngine.js';

export interface IAnalysis {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  resumeId: Types.ObjectId;
  resumeVersionId: Types.ObjectId;
  versionNumber: number;
  jobDescription: string;
  jobTitle: string;
  company?: string;
  scores: AnalysisReport['scores'];
  report: AnalysisReport;
  practicedQuestionIds: string[];
  previousAnalysisId?: Types.ObjectId;
  scoringVersion: string;
  createdAt: Date;
}

const AnalysisSchema = new Schema<IAnalysis>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true, index: true },
    resumeVersionId: { type: Schema.Types.ObjectId, ref: 'ResumeVersion', required: true },
    versionNumber: { type: Number, required: true },
    jobDescription: { type: String, required: true },
    jobTitle: { type: String, required: true },
    company: String,
    scores: { jobFit: Number, atsReadiness: Number, resumeQuality: Number, interviewReadiness: Number },
    report: { type: Schema.Types.Mixed, required: true },
    practicedQuestionIds: { type: [String], default: [] },
    previousAnalysisId: { type: Schema.Types.ObjectId, ref: 'Analysis' },
    scoringVersion: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

export const AnalysisModel: Model<IAnalysis> = mongoose.models.Analysis || mongoose.model<IAnalysis>('Analysis', AnalysisSchema);
