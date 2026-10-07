import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel, toPublicUser, type IUser } from '../models/User.js';
import { requireDatabase } from '../middleware/requireDatabase.js';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { limiters } from '../middleware/rateLimit.js';
import {
  REFRESH_COOKIE,
  issueAccessToken,
  issueRefreshToken,
  refreshCookieOptions,
  revokeAllForUser,
  revokeRefreshFamily,
  rotateRefreshToken,
} from '../services/tokenService.js';
import { audit } from '../services/auditService.js';

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  targetRole: z.string().trim().max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  targetRole: z.string().trim().max(80).optional(),
  profile: z
    .object({
      phone: z.string().max(30).optional(),
      location: z.string().max(80).optional(),
      college: z.string().max(120).optional(),
      degree: z.string().max(80).optional(),
      branch: z.string().max(80).optional(),
      graduationYear: z.number().int().min(1990).max(2040).optional(),
      cgpa: z.string().max(20).optional(),
      linkedin: z.string().max(200).optional(),
      github: z.string().max(200).optional(),
      portfolio: z.string().max(200).optional(),
      bio: z.string().max(600).optional(),
      preferredLocations: z.array(z.string().max(60)).max(10).optional(),
    })
    .optional(),
});

/** bcrypt cost factor for every password hash. The dummy hash must use the same cost to equalise timing. */
export const BCRYPT_COST = 12;

/** Used to keep login timing identical for unknown emails (prevents account enumeration by timing). */
const DUMMY_HASH = bcrypt.hashSync('resumefit-timing-equaliser', BCRYPT_COST);

/** Starts a session: short-lived access token in the body, rotating refresh token in an httpOnly cookie. */
const startSession = async (req: Request, res: Response, user: IUser, status = 200) => {
  const refresh = await issueRefreshToken(String(user._id), req);
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions());
  return res.status(status).json({ token: issueAccessToken(user), user: toPublicUser(user) });
};

/** Refresh requests must come from our own client code (custom header ⇒ cross-site forms cannot send it). */
const requireClientHeader = (req: Request, res: Response) => {
  if (req.header('x-requested-with') !== 'resumefit') {
    res.status(403).json({ code: 'CSRF_CHECK_FAILED', message: 'Missing client header.' });
    return false;
  }
  return true;
};

export const authRouter = Router();

authRouter.use(requireDatabase);

authRouter.post(
  '/register',
  limiters.auth,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid registration payload', errors: parsed.error.flatten() });
    }
    const { name, email, password, targetRole } = parsed.data;
    if (await UserModel.exists({ email: email.toLowerCase() })) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await UserModel.create({ name, email, passwordHash, targetRole: targetRole || 'Software Engineer' });
    audit(req, 'auth.register', {}, String(user._id));
    return startSession(req, res, user, 201);
  }),
);

authRouter.post(
  '/login',
  limiters.auth,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Enter a valid email and password.', errors: parsed.error.flatten() });
    }
    const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase() });
    const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      audit(req, 'auth.login_failed', { reason: user ? 'bad_password' : 'unknown_email' }, user ? String(user._id) : undefined);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    audit(req, 'auth.login', {}, String(user._id));
    return startSession(req, res, user);
  }),
);

/** Exchanges the refresh cookie for a new access token, rotating the refresh token. */
authRouter.post(
  '/refresh',
  limiters.refresh,
  asyncHandler(async (req, res) => {
    if (!requireClientHeader(req, res)) return;
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    // No cookie simply means "not signed in" (e.g. a first visit): not an error.
    if (!token) return res.status(204).end();
    const result = await rotateRefreshToken(token, req);
    // "No valid session" (expired, revoked, reused) is answered with 204 + a cleared cookie: the client then
    // shows the sign-in page. Reuse of a rotated token has already revoked the whole family and is audited.
    if (!result.ok) {
      res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
      if (result.reason === 'reuse_detected') audit(req, 'auth.refresh_reuse_detected', {}, result.userId);
      res.setHeader('X-Session-Status', result.reason);
      return res.status(204).end();
    }
    const user = await UserModel.findById(result.userId);
    if (!user) return res.status(204).end();
    res.cookie(REFRESH_COOKIE, result.token, refreshCookieOptions());
    return res.json({ token: issueAccessToken(user), user: toPublicUser(user) });
  }),
);

/** Ends this session: revokes its refresh-token family and clears the cookie. */
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (!requireClientHeader(req, res)) return;
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const userId = token ? await revokeRefreshFamily(token) : null;
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    if (userId) audit(req, 'auth.logout', {}, userId);
    return res.status(204).end();
  }),
);

/** Ends every session of the signed-in user. */
authRouter.post(
  '/logout-all',
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    await revokeAllForUser(req.user!.id);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    audit(req, 'auth.logout_all');
    return res.status(204).end();
  }),
);

authRouter.post(
  '/change-password',
  authMiddleware,
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const shortPassword = parsed.error.issues.some((issue) => issue.path[0] === 'newPassword' && issue.code === 'too_small');
      return res.status(400).json({
        message: shortPassword ? 'Password must be at least 8 characters.' : 'Current and new passwords are required.',
      });
    }

    const user = await UserModel.findById(req.user!.id);
    if (!user) return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Account no longer exists' });
    if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }
    if (await bcrypt.compare(parsed.data.newPassword, user.passwordHash)) {
      return res.status(400).json({ message: 'New password must be different from your current password.' });
    }

    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_COST);
    await user.save();
    await revokeAllForUser(req.user!.id);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    audit(req, 'auth.password_changed');
    return res.json({ message: 'Password changed successfully.' });
  }),
);

authRouter.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await UserModel.findById(req.user!.id);
    if (!user) return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Account no longer exists' });
    return res.json({ user: toPublicUser(user) });
  }),
);

authRouter.put(
  '/profile',
  authMiddleware,
  limiters.mutation,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid profile', errors: parsed.error.flatten() });
    const user = await UserModel.findById(req.user!.id);
    if (!user) return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Account no longer exists' });
    if (parsed.data.name) user.name = parsed.data.name;
    if (parsed.data.targetRole !== undefined) user.targetRole = parsed.data.targetRole;
    if (parsed.data.profile) user.profile = { ...(user.profile ?? {}), ...parsed.data.profile };
    await user.save();
    audit(req, 'profile.update');
    return res.json({ user: toPublicUser(user) });
  }),
);
