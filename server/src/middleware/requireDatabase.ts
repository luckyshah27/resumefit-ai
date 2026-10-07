import type { NextFunction, Request, Response } from 'express';
import { isDatabaseReady } from '../config/database.js';
import { env } from '../config/env.js';
import { databaseState } from '../config/database.js';

/** Fails fast with a clear configuration error instead of silently falling back to fake data. */
export const requireDatabase = (_req: Request, res: Response, next: NextFunction) => {
  if (isDatabaseReady()) return next();
  return res.status(503).json({
    code: 'DATABASE_UNAVAILABLE',
    message: 'Database unavailable. Check that MONGO_URI points to a running MongoDB instance (or start the server with DEMO_MODE=true for a local demo).',
    // Connection details are useful locally but are never sent in production.
    ...(env.isProduction ? {} : { detail: databaseState.error }),
  });
};
