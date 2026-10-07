import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * Opaque refresh tokens. Only a SHA-256 hash is stored. Tokens rotate on every use; all tokens issued
 * from one login share a `familyId`, so reuse of an already-rotated token revokes the whole family.
 */
export interface IRefreshToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: 'rotated' | 'logout' | 'logout_all' | 'reuse_detected';
  createdByIp?: string;
  userAgent?: string;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: { type: String, enum: ['rotated', 'logout', 'logout_all', 'reuse_detected'] },
    createdByIp: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// Expired tokens are removed automatically.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel: Model<IRefreshToken> = mongoose.models.RefreshToken || mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
