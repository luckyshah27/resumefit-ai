import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger, requestContext } from '../observability/logger.js';

const VALID_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Assigns a request id (honouring a well-formed incoming X-Request-Id), and logs one line per request. */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', requestId);
  const started = performance.now();
  const context = { requestId } as { requestId: string; userId?: string };

  res.on('finish', () => {
    requestContext.run(context, () =>
      logger.info('request.completed', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
        ip: req.ip,
      }),
    );
  });

  requestContext.run(context, () => next());
};

/** Lets later middleware (auth) attach the user id to the log context. */
export const setContextUser = (userId: string) => {
  const store = requestContext.getStore();
  if (store) store.userId = userId;
};
