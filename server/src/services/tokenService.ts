import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CookieOptions, Request } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../config/env.js';
import { RefreshTokenModel } from '../models/RefreshToken.js';

export const JWT_ISSUER = 'resumefit-api';
export const JWT_AUDIENCE = 'resumefit-client';
export const REFRESH_COOKIE = 'rf_refresh';

export type AccessPayload = { sub: string; email: string; name: string; typ: 'access' };

export const issueAccessToken = (user: { _id: unknown; email: string; name: string }) =>
  jwt.sign({ email: user.email, name: user.name, typ: 'access' }, env.jwtSecret, {
    subject: String(user._id),
    expiresIn: env.accessTokenTtl as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE }) as jwt.JwtPayload & AccessPayload;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: env.cookieSameSite,
  path: '/api/auth',
  maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
});

export const issueRefreshToken = async (userId: string, req: Request, familyId: string = randomUUID()) => {
  const token = randomBytes(48).toString('base64url');
  await RefreshTokenModel.create({
    userId: new Types.ObjectId(userId),
    tokenHash: hashToken(token),
    familyId,
    expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
    createdByIp: req.ip,
    userAgent: req.header('user-agent')?.slice(0, 300),
  });
  return token;
};

export type RotationResult = { ok: true; userId: string; token: string } | { ok: false; reason: 'invalid' | 'expired' | 'reuse_detected'; userId?: string };

/** Single-use rotation. Presenting an already-rotated token is treated as theft: the whole family is revoked. */
export const rotateRefreshToken = async (token: string, req: Request): Promise<RotationResult> => {
  const record = await RefreshTokenModel.findOne({ tokenHash: hashToken(token) });
  if (!record) return { ok: false, reason: 'invalid' };
  if (record.revokedAt) {
    if (record.revokedReason === 'rotated') {
      await RefreshTokenModel.updateMany({ familyId: record.familyId, revokedAt: { $exists: false } }, { revokedAt: new Date(), revokedReason: 'reuse_detected' });
      return { ok: false, reason: 'reuse_detected', userId: String(record.userId) };
    }
    return { ok: false, reason: 'invalid' };
  }
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  // Atomic claim so two concurrent refreshes cannot both succeed.
  const claimed = await RefreshTokenModel.updateOne({ _id: record._id, revokedAt: { $exists: false } }, { revokedAt: new Date(), revokedReason: 'rotated' });
  if (claimed.modifiedCount !== 1) return { ok: false, reason: 'invalid' };
  const next = await issueRefreshToken(String(record.userId), req, record.familyId);
  return { ok: true, userId: String(record.userId), token: next };
};

/** Logout: revokes the session (token family) that owns this refresh token. */
export const revokeRefreshFamily = async (token: string) => {
  const record = await RefreshTokenModel.findOne({ tokenHash: hashToken(token) });
  if (!record) return null;
  await RefreshTokenModel.updateMany({ familyId: record.familyId, revokedAt: { $exists: false } }, { revokedAt: new Date(), revokedReason: 'logout' });
  return String(record.userId);
};

export const revokeAllForUser = (userId: string) =>
  RefreshTokenModel.updateMany({ userId: new Types.ObjectId(userId), revokedAt: { $exists: false } }, { revokedAt: new Date(), revokedReason: 'logout_all' });
