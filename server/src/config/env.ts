import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);

const int = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const bool = (value: string | undefined, fallback: boolean) => (value === undefined || value === '' ? fallback : value === 'true');

export const env = {
  nodeEnv,
  isProduction,
  port: int(process.env.PORT, 5000),
  jwtSecret: process.env.JWT_SECRET ?? (isProduction ? '' : 'dev-secret-key'),
  mongoUri: process.env.MONGO_URI ?? (isProduction ? '' : 'mongodb://127.0.0.1:27017/resumefit-ai'),
  /**
   * DEMO_MODE=true starts an in-memory MongoDB (data is lost on restart). It is an explicit opt-in for
   * local demos and is refused in production; there is no silent fallback.
   */
  demoMode: process.env.DEMO_MODE === 'true' || process.argv.includes('--demo'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',

  /** Browser origins allowed by CORS (comma-separated). Empty = same-origin only. CLIENT_ORIGIN kept for compatibility. */
  clientUrls: list(process.env.CLIENT_URL ?? process.env.CLIENT_ORIGIN),
  /** Public URL of this API (used only in docs/logs; no hostnames are hard-coded). */
  serverUrl: process.env.SERVER_URL ?? '',
  /** Serve the built client (client/dist) from this server — single-origin deployment. */
  serveClient: bool(process.env.SERVE_CLIENT, false),
  /** Number of reverse proxies in front of the app (for correct client IPs in rate limiting). */
  trustProxy: int(process.env.TRUST_PROXY, 0),

  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTokenTtlDays: int(process.env.REFRESH_TOKEN_TTL_DAYS, 30),
  cookieSecure: bool(process.env.COOKIE_SECURE, isProduction),
  cookieSameSite: (['strict', 'lax', 'none'].includes(process.env.COOKIE_SAMESITE ?? '') ? process.env.COOKIE_SAMESITE : 'strict') as 'strict' | 'lax' | 'none',

  /** Optional ClamAV (clamd) upload scanning. Unset = scanning disabled (local development). */
  clamavHost: process.env.CLAMAV_HOST ?? '',
  clamavPort: int(process.env.CLAMAV_PORT, 3310),
  clamavRequired: bool(process.env.CLAMAV_REQUIRED, false),
};

export const validateEnv = () => {
  const problems: string[] = [];
  if (env.isProduction) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be set to a random string of at least 32 characters in production.');
    if (!process.env.MONGO_URI) problems.push('MONGO_URI must be set in production.');
    if (env.demoMode) problems.push('DEMO_MODE cannot be enabled in production.');
    if (env.cookieSameSite === 'none' && !env.cookieSecure) problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true.');
    if (env.clamavRequired && !env.clamavHost) problems.push('CLAMAV_REQUIRED=true requires CLAMAV_HOST.');
  }
  return problems;
};
