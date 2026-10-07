import type { NextFunction, Request, Response } from 'express';

/**
 * Defence in depth against MongoDB operator injection: removes keys that start with "$" or contain "."
 * from request bodies and query strings. Route inputs are also validated with Zod.
 */
const clean = (value: unknown, depth = 0): unknown => {
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) delete (value as Record<string, unknown>)[key];
    else (value as Record<string, unknown>)[key] = clean((value as Record<string, unknown>)[key], depth + 1);
  }
  return value;
};

export const sanitizeInput = (req: Request, _res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') clean(req.body);
  if (req.query && typeof req.query === 'object') clean(req.query);
  next();
};
