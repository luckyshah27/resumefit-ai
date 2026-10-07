import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IExperiment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  config: Record<string, unknown>;
  datasetVersion: string;
  results: Record<string, unknown>;
  durationMs: number;
  createdAt: Date;
}

const ExperimentSchema = new Schema<IExperiment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    config: { type: Schema.Types.Mixed, required: true },
    datasetVersion: { type: String, required: true },
    results: { type: Schema.Types.Mixed, required: true },
    durationMs: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

export const ExperimentModel: Model<IExperiment> = mongoose.models.Experiment || mongoose.model<IExperiment>('Experiment', ExperimentSchema);
