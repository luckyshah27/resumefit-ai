import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/tokenService.js';
import { setContextUser } from './requestContext.js';

export interface AuthenticatedRequest extends Request<Record<string, string>> {
  user?: { id: string; email: string; name: string };
}

/** Verifies the short-lived access token (HS256, issuer/audience checked). */
export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' });
  }

  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    if (payload.typ !== 'access' || !payload.sub) throw new jwt.JsonWebTokenError('wrong token type');
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    setContextUser(payload.sub);
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Your session expired. Please sign in again.' });
    }
    return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Your session is invalid. Please sign in again.' });
  }
};
