import type { Request } from 'express';
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';

type LimiterOptions = { name: string; windowMs: number; limit: number; perUser?: boolean; message?: string; force?: boolean };

const MINUTE = 60 * 1000;

/**
 * Creates a rate limiter that answers with a consistent JSON 429 body.
 * Keys by authenticated user when `perUser` (falls back to IP). Disabled under NODE_ENV=test unless `force`.
 */
export const createRateLimiter = ({ name, windowMs, limit, perUser = false, message, force = false }: LimiterOptions) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.nodeEnv === 'test' && !force,
    keyGenerator: (req: Request) => {
      const userId = (req as Request & { user?: { id: string } }).user?.id;
      return perUser && userId ? `${name}:user:${userId}` : `${name}:ip:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
    },
    handler: (req, res, _next, options: Options) => {
      logger.warn('rate_limit.exceeded', { limiter: name, path: req.originalUrl.split('?')[0] });
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.status(429).json({ code: 'RATE_LIMITED', message: message ?? `Too many requests. Please wait and try again (limit resets within ${Math.ceil(retryAfter / 60)} minutes).` });
    },
  });

/** Limits (per window). Expensive operations are stricter; AI is strictest. */
export const limiters = {
  api: createRateLimiter({ name: 'api', windowMs: 15 * MINUTE, limit: 1000 }),
  auth: createRateLimiter({ name: 'auth', windowMs: 15 * MINUTE, limit: 20, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }),
  refresh: createRateLimiter({ name: 'refresh', windowMs: 15 * MINUTE, limit: 120 }),
  analysis: createRateLimiter({ name: 'analysis', windowMs: 60 * MINUTE, limit: 30, perUser: true, message: 'Analysis limit reached (30 per hour). Please try again later.' }),
  mutation: createRateLimiter({ name: 'mutation', windowMs: 60 * MINUTE, limit: 120, perUser: true }),
  export: createRateLimiter({ name: 'export', windowMs: 60 * MINUTE, limit: 60, perUser: true }),
  ai: createRateLimiter({ name: 'ai', windowMs: 60 * MINUTE, limit: 10, perUser: true, message: 'AI wording limit reached (10 per hour). Deterministic suggestions are still available.' }),
  research: createRateLimiter({ name: 'research', windowMs: 60 * MINUTE, limit: 6, perUser: true, message: 'Experiment limit reached (6 per hour).' }),
};
