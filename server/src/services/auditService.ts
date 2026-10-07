import type { Request } from 'express';
import { Types } from 'mongoose';
import { AuditLogModel } from '../models/AuditLog.js';
import { isDatabaseReady } from '../config/database.js';
import { logger, requestContext } from '../observability/logger.js';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.password_changed'
  | 'auth.refresh_reuse_detected'
  | 'profile.update'
  | 'analysis.create'
  | 'analysis.delete'
  | 'resume.fixes_applied'
  | 'resume.version_edit'
  | 'resume.version_restore'
  | 'resume.export'
  | 'report.export'
  | 'application.delete'
  | 'upload.rejected'
  | 'ai.rewrite';

/** Fire-and-forget audit record. Failures are logged, never surfaced to the user. */
export const audit = (req: Request & { user?: { id: string } }, action: AuditAction, meta: Record<string, unknown> = {}, userId?: string) => {
  const id = userId ?? req.user?.id;
  logger.info('audit', { action, ...meta });
  if (!isDatabaseReady()) return;
  AuditLogModel.create({
    userId: id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined,
    action,
    ip: req.ip,
    userAgent: req.header('user-agent')?.slice(0, 300),
    requestId: requestContext.getStore()?.requestId,
    meta,
  }).catch((error) => logger.error('audit.write_failed', { action, error: error instanceof Error ? error.message : String(error) }));
};
