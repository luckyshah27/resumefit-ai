import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const APPLICATION_STATUSES = ['SAVED', 'APPLIED', 'OA', 'INTERVIEW', 'SELECTED', 'REJECTED', 'WITHDRAWN'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface IApplication {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  company: string;
  role: string;
  jobDescription?: string;
  jobUrl?: string;
  location?: string;
  jobFitScore?: number;
  analysisId?: Types.ObjectId;
  resumeVersionId?: Types.ObjectId;
  resumeVersionNumber?: number;
  status: ApplicationStatus;
  statusHistory: Array<{ status: ApplicationStatus; at: Date }>;
  appliedAt?: Date;
  deadline?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApplicationSchema = new Schema<IApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    jobDescription: { type: String, maxlength: 20000 },
    jobUrl: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 120 },
    jobFitScore: Number,
    analysisId: { type: Schema.Types.ObjectId, ref: 'Analysis' },
    resumeVersionId: { type: Schema.Types.ObjectId, ref: 'ResumeVersion' },
    resumeVersionNumber: Number,
    status: { type: String, enum: APPLICATION_STATUSES, default: 'SAVED' },
    statusHistory: { type: [{ status: { type: String, enum: APPLICATION_STATUSES }, at: Date, _id: false }], default: [] },
    appliedAt: Date,
    deadline: Date,
    notes: { type: String, maxlength: 5000 },
  },
  { timestamps: true },
);

export const ApplicationModel: Model<IApplication> = mongoose.models.Application || mongoose.model<IApplication>('Application', ApplicationSchema);
