import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { authRouter } from './routes/authRoutes.js';
import { analysisRouter } from './routes/analysisRoutes.js';
import { resumeRouter } from './routes/resumeRoutes.js';
import { applicationRouter } from './routes/applicationRoutes.js';
import { researchRouter } from './routes/researchRoutes.js';
import { notFoundHandler, errorHandler, asyncHandler } from './middleware/errorHandler.js';
import { authMiddleware, type AuthenticatedRequest } from './middleware/auth.js';
import { requireDatabase } from './middleware/requireDatabase.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { sanitizeInput } from './middleware/sanitize.js';
import { limiters } from './middleware/rateLimit.js';
import { computeAnalytics } from './services/analyticsService.js';
import { databaseState, isDatabaseReady } from './config/database.js';
import { SCORING_VERSION } from './lib/scoringEngine.js';
import { env } from './config/env.js';
import { isAiRewriteEnabled } from './services/aiRewriter.js';
import { getFileScanner } from './services/fileScanner.js';

const app = express();

app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', env.trustProxy);

app.use(requestContextMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
// Same-origin by default; cross-origin browsers must be listed in CLIENT_URL. Credentials are needed for the refresh cookie.
app.use(cors({ origin: env.clientUrls.length ? env.clientUrls : false, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(sanitizeInput);
app.use('/api', limiters.api);

app.get(
  '/api/health',
  asyncHandler(async (_req, res) => {
    let pingMs: number | null = null;
    if (isDatabaseReady() && mongoose.connection.db) {
      const started = performance.now();
      await mongoose.connection.db.admin().ping();
      pingMs = Math.round(performance.now() - started);
    }
    res.status(isDatabaseReady() || databaseState.mode === 'test' ? 200 : 503).json({
      status: isDatabaseReady() ? 'ok' : 'degraded',
      service: 'RESUMEFIT AI API',
      database: { connected: isDatabaseReady(), mode: databaseState.mode, pingMs },
      scoringVersion: SCORING_VERSION,
      aiRewrite: isAiRewriteEnabled(),
      uploadScanning: getFileScanner().engine,
      uptimeSeconds: Math.round(process.uptime()),
    });
  }),
);

app.use('/api/auth', authRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/resumes', resumeRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/research', researchRouter);
app.get(
  '/api/analytics',
  authMiddleware,
  requireDatabase,
  asyncHandler(async (req: AuthenticatedRequest, res) => res.json(await computeAnalytics(req.user!.id))),
);
app.use('/api', notFoundHandler);

// Optional single-origin deployment: serve the built React app and fall back to index.html for client routes.
if (env.serveClient) {
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
