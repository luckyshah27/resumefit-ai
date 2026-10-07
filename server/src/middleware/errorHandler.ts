import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ResumeParseError } from '../services/resumeParser.js';
import { logger } from '../observability/logger.js';
import { audit } from '../services/auditService.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl.split('?')[0]}` });
};

/** Converts every error into a safe JSON response. Stack traces and internal messages are logged, never sent. */
export const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ResumeParseError) {
    audit(req, 'upload.rejected', { code: error.code });
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ message: error.message, details: error.details });
  }
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ code: error.code, message: error.code === 'LIMIT_FILE_SIZE' ? 'File is too large. The maximum size is 5 MB.' : 'The upload could not be processed.' });
  }
  if (error.name === 'CastError') {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
  }
  if ((error as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'INVALID_JSON', message: 'Request body is not valid JSON.' });
  }
  if ((error as { type?: string }).type === 'entity.too.large') {
    return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' });
  }
  logger.error('request.failed', { error: error.message, stack: error.stack, path: req.originalUrl.split('?')[0] });
  return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' });
};

/** Wraps async route handlers so rejected promises reach the error handler (Express 4). */
export const asyncHandler =
  <T extends Request>(handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
