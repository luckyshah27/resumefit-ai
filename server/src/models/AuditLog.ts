import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** Security-relevant events. Retained for 180 days (TTL index). Never stores secrets or resume content. */
export interface IAuditLog {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  action: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, index: true },
    ip: String,
    userAgent: { type: String, maxlength: 300 },
    requestId: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const AuditLogModel: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
