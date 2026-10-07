# Security

This document describes the security design of ResumeFit AI as it is implemented in the repository. Every control listed here has a file reference; anything that is not implemented is listed under [Known limitations / residual risks](#known-limitations--residual-risks).

Related documents: [architecture.md](architecture.md) (components and data flow), [api.md](api.md) (endpoints and error codes), [testing.md](testing.md) (how the controls are tested), [limitations.md](limitations.md) (project-wide limitations), [deployment.md](deployment.md) (production configuration).

All paths below are relative to the repository root.

---

## 1. Threat model summary

### 1.1 Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| User accounts (email, name, password hash, candidate profile) | MongoDB `users` collection (`server/src/models/User.ts`) | Account takeover exposes all user data. Profile fields (phone, location, college, CGPA, links) are personal data. |
| Resumes and resume versions (extracted text, edits, exports) | MongoDB `resumes` / resume version collections (`server/src/models/Resume.ts`) | Resumes are personal data: contact details, education and employment history. |
| Analyses and scores | MongoDB `analyses` collection (`server/src/models/Analysis.ts`) | Must belong to one user only; integrity matters because users act on them. |
| Job applications tracker | MongoDB `applications` collection (`server/src/models/Application.ts`) | Personal job-search history. |
| Session credentials (access token, refresh token) | Access token in browser memory; refresh token in an httpOnly cookie, stored server-side only as a hash (`server/src/models/RefreshToken.ts`) | Theft allows impersonation. |
| Server secrets (`JWT_SECRET`, `MONGO_URI` credentials, `ANTHROPIC_API_KEY`) | Environment variables only (`server/src/config/env.ts`) | Leakage allows token forgery, database access or API-cost abuse. |

### 1.2 Actors and entry points

- **Anonymous internet users**: can reach `/api/health`, `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` and the static client.
- **Authenticated users**: can reach all other `/api/*` routes, but only for their own data.
- **Malicious websites visited by a signed-in user**: may attempt cross-site requests (CSRF) using the browser's cookies.
- **Uploaded files**: PDF/DOCX files are untrusted input processed by third-party parsers.
- **The external AI service** (optional): its output is treated as untrusted text.

### 1.3 Main threats considered

Credential stuffing and brute force; account enumeration; session theft and replay; CSRF against cookie-authenticated endpoints; XSS leading to token theft; horizontal privilege escalation (accessing another user's resume or analysis by id); NoSQL operator injection; malicious or malformed uploads; resource exhaustion (large bodies, expensive analysis or AI calls); information disclosure through errors and logs; leakage of secrets; AI output introducing fabricated content into a resume.

---

## 2. Implemented controls

### 2.1 Password storage and login

- Passwords are hashed with **bcrypt, cost factor 12** (`bcryptjs`) on registration (`server/src/routes/authRoutes.ts`, `bcrypt.hash(password, 12)`). Plain passwords are never stored or logged.
- Registration is validated with Zod: password length 8 to 128 characters, email format, name length (`registerSchema` in `authRoutes.ts`).
- Login returns the same response (`401 Invalid email or password`) for an unknown email and for a wrong password.
- **Timing equalisation for unknown emails**: when no user matches, `bcrypt.compare` is still executed against a pre-computed dummy hash (`DUMMY_HASH` in `authRoutes.ts`), so the response time does not reveal immediately whether the account exists. Note: the dummy hash is generated with cost 10 while real hashes use cost 12, so equalisation is approximate (see [residual risks](#known-limitations--residual-risks)).
- Failed logins are audited with an internal reason (`unknown_email` or `bad_password`) that is stored server-side only and never returned to the client.
- Login and registration are rate limited (20 requests per 15 minutes per IP; see [2.9](#29-rate-limiting)).

### 2.2 Access tokens (JWT)

Implemented in `server/src/services/tokenService.ts` and `server/src/middleware/auth.ts`.

- Signed with **HS256** using `JWT_SECRET`; lifetime `ACCESS_TOKEN_TTL` (default **15 minutes**).
- Claims: `sub` (user id), `email`, `name`, `typ: "access"`, `iss: "resumefit-api"`, `aud: "resumefit-client"`.
- Verification **pins the algorithm** (`algorithms: ['HS256']`), the **issuer** and the **audience**, which prevents `alg: none` and algorithm-confusion attacks and rejects tokens minted for another purpose. The middleware additionally requires `typ === 'access'` and a `sub`.
- Sent only in the `Authorization: Bearer` header, never in a cookie, so ordinary API calls are not exposed to CSRF.
- **Expired vs invalid distinction**: the middleware answers `401 TOKEN_EXPIRED` for an expired token and `401 TOKEN_INVALID` for any other failure; a missing header gives `401 AUTH_REQUIRED`. The client uses this to refresh transparently once and otherwise return to the sign-in page.

### 2.3 Refresh tokens and sessions

Implemented in `server/src/services/tokenService.ts`, `server/src/models/RefreshToken.ts` and `server/src/routes/authRoutes.ts`.

| Property | Implementation |
|---|---|
| Format | Opaque random value: 48 bytes from `crypto.randomBytes`, base64url-encoded. Not a JWT. |
| Storage | Only the **SHA-256 hash** is stored (`tokenHash`, unique index). A database leak does not reveal usable tokens. |
| Cookie | Name `rf_refresh`; `httpOnly: true`; `SameSite` from `COOKIE_SAMESITE` (default `strict`); `Secure` from `COOKIE_SECURE` (default `true` when `NODE_ENV=production`); `path: /api/auth`, so the cookie is not sent to any other route; `maxAge` = `REFRESH_TOKEN_TTL_DAYS` (default 30 days). |
| Rotation | Every successful `POST /api/auth/refresh` revokes the presented token (`revokedReason: 'rotated'`) and issues a new one in the same family. The revoke uses an atomic conditional update, so two concurrent refreshes cannot both succeed. |
| Reuse detection | Each login starts a new `familyId`. If a token that was already rotated is presented again, this is treated as theft: **every unrevoked token in the family is revoked** (`reuse_detected`), the cookie is cleared and the event is audited (`auth.refresh_reuse_detected`). |
| Logout | `POST /api/auth/logout` revokes the whole family of the presented token and clears the cookie. |
| Logout everywhere | `POST /api/auth/logout-all` (requires an access token) revokes every active refresh token of the user. |
| Expiry | `expiresAt` is checked on use; a MongoDB **TTL index** (`expireAfterSeconds: 0`) removes expired records automatically. |
| Metadata | Creating IP and user agent (truncated to 300 characters) are stored for investigation. |

An absent, expired, revoked or reused refresh token is answered with `204 No Content` and a cleared cookie (plus an `X-Session-Status` header naming the reason), which the client interprets as "not signed in".

### 2.4 CSRF defence

Only the endpoints under `/api/auth` receive the refresh cookie, and of these only `/refresh` and `/logout` act on it. They are protected in three layers:

1. **Custom header check**: `/refresh` and `/logout` require `X-Requested-With: resumefit` and otherwise return `403 CSRF_CHECK_FAILED` (`requireClientHeader` in `authRoutes.ts`). An HTML form or simple cross-site request cannot set a custom header; a cross-origin `fetch` that sets one triggers a CORS preflight, which fails (see 3).
2. **SameSite=Strict cookie** (default), so browsers do not attach the cookie to cross-site requests at all.
3. **Restricted CORS** (`server/src/app.ts`): when `CLIENT_URL` is empty, CORS is disabled (`origin: false`), i.e. same-origin only. When `CLIENT_URL` is set, only the listed origins are allowed, with credentials.

All other state-changing endpoints authenticate with the `Authorization` header, which browsers never attach automatically, so they are not CSRF-able.

### 2.5 Client-side token handling

Implemented in `client/src/api/client.ts` and `client/src/context/AuthContext.tsx`.

- The access token is held **only in a JavaScript module variable (memory)**. It is never written to `localStorage`, `sessionStorage` or a cookie. A page reload restores the session through the httpOnly refresh cookie.
- Only the **non-secret public profile** (`resumefit-profile`: id, name, email, target role, profile fields, creation date) is cached in `localStorage` so the UI can render while the session is being restored. The legacy key `resumefit-auth`, which held a token in an earlier version, is actively removed.
- Concurrent refresh attempts share one in-flight request, so rotation does not trigger false reuse detection.
- The refresh cookie is httpOnly, so script injected through XSS cannot read it; the impact of XSS is limited to the current page session (see residual risks).

### 2.6 Input validation and injection defence

- **Zod schemas** validate every request body on the route level (for example `registerSchema`, `loginSchema`, `profileSchema` in `authRoutes.ts`; `createSchema`, `fixSchema`, `scoreSchema` in `server/src/routes/analysisRoutes.ts`; schemas in `applicationRoutes.ts`, `resumeRoutes.ts`, `researchRoutes.ts`). Schemas enforce types, enumerations and maximum lengths (e.g. job description 20,000 characters, resume text 40,000 characters, at most 40 fixes per request).
- **Body size limits**: JSON and URL-encoded bodies are limited to 2 MB (`server/src/app.ts`); oversize bodies get `413 PAYLOAD_TOO_LARGE`, malformed JSON gets `400 INVALID_JSON`.
- **NoSQL operator stripping** (`server/src/middleware/sanitize.ts`): as defence in depth, every key that starts with `$` or contains `.` is deleted from `req.body` and `req.query` (recursively, up to depth 8) before routing. This blocks payloads such as `{"email": {"$ne": null}}`.
- Queries are built with Mongoose using typed values; no string-concatenated queries or `$where` are used.

### 2.7 Authorization (object ownership)

- Every data route is mounted behind `authMiddleware` (`server/src/app.ts`, router-level `use(authMiddleware)` in the routers).
- Path ids are checked with `Types.ObjectId.isValid` before querying; invalid ids are answered with `404` (e.g. `ownedVersion` in `server/src/routes/resumeRoutes.ts`, `getOwnedAnalysis` in `server/src/services/analysisService.ts`, `applicationRoutes.ts`). A residual Mongoose `CastError` is also mapped to `404` (`errorHandler.ts`).
- **Every lookup of a user-owned record includes `userId: req.user.id` in the filter** (e.g. `AnalysisModel.findOne({ _id, userId })`, `ApplicationModel.deleteOne({ _id, userId })`, `ResumeVersionModel.findOne({ _id, userId })`). Records that belong to another user are therefore indistinguishable from non-existent ones (`404`), which prevents both access and id enumeration. Secondary `findById` lookups are only performed with ids taken from a record already verified as owned.
- List endpoints filter by `userId` and are bounded (`limit(100)`, `limit(20)`).

### 2.8 Upload security

Implemented in `server/src/routes/analysisRoutes.ts`, `server/src/services/resumeParser.ts` and `server/src/services/fileScanner.ts`.

| Check | Detail |
|---|---|
| Transport limit | `multer` with in-memory storage: `fileSize` 5 MB, 1 file, 10 fields. Exceeding the size gives `413 LIMIT_FILE_SIZE`. Files are never written to disk. |
| Extension allowlist | Only `.pdf` and `.docx` (`415 UNSUPPORTED_TYPE`). |
| Size bounds | Rejected above 5 MB (`FILE_TOO_LARGE`) and below 100 bytes (`FILE_TOO_SMALL`). |
| MIME check | The declared MIME type must match the extension (or be a generic `application/octet-stream` type) (`415 MIME_MISMATCH`). |
| Magic bytes | PDF must contain `%PDF-` in the first 1 KB; DOCX must start with the ZIP signature `PK\x03\x04` and contain `word/document.xml` (`422 CORRUPTED_FILE`). This catches renamed files. |
| Malware scan (optional) | If `CLAMAV_HOST` is set, the file is streamed to a ClamAV daemon using the clamd `zINSTREAM` protocol over TCP (15 s timeout). Infected files are rejected (`422 INFECTED_FILE`). If the scanner is unreachable, the upload is rejected with `503 SCAN_UNAVAILABLE` when `CLAMAV_REQUIRED=true`; otherwise the failure is logged (`upload.scan_skipped`) and processing continues. Without `CLAMAV_HOST`, scanning is disabled (`uploadScanning: "none"` in `/api/health`). |
| Parser failures | Corrupted files (`CORRUPTED_FILE`), password-protected PDFs (`ENCRYPTED_PDF`) and image-only/scanned documents with fewer than 50 non-whitespace characters of text (`NO_TEXT`) are rejected with a user-facing message. |
| No execution | Uploaded content is only parsed for text (`pdf-parse`, `mammoth`); it is never executed, served back as-is, or stored as a file. DOCX HTML from `mammoth` is converted to plain text by stripping tags. |
| Audit | Every rejection is audited as `upload.rejected` with the error code. |

### 2.9 Rate limiting

Implemented with `express-rate-limit` in `server/src/middleware/rateLimit.ts`. Limits use IETF draft-8 `RateLimit` headers and answer with `429 {"code":"RATE_LIMITED", ...}`. Per-user limiters key by the authenticated user id (falling back to IP); the others key by client IP (IPv6 addresses are grouped by subnet via `ipKeyGenerator`). Limiters are disabled under `NODE_ENV=test` unless forced.

| Limiter | Window | Limit | Key | Applied to |
|---|---|---|---|---|
| `api` | 15 min | 1000 | IP | All `/api/*` routes |
| `auth` | 15 min | 20 | IP | `POST /api/auth/register`, `POST /api/auth/login` |
| `refresh` | 15 min | 120 | IP | `POST /api/auth/refresh` |
| `analysis` | 60 min | 30 | user | Creating / scoring analyses |
| `mutation` | 60 min | 120 | user | Profile update, fixes, practice flags, versions, applications, deletes |
| `export` | 60 min | 60 | user | PDF/DOCX report and resume exports |
| `ai` | 60 min | 10 | user | `POST /api/analysis/:id/ai-rewrite` |
| `research` | 60 min | 6 | user | Running research experiments |

Correct client IPs behind a reverse proxy require `TRUST_PROXY` (see [deployment.md](deployment.md)).

### 2.10 Secure HTTP headers

Configured in `server/src/app.ts`:

- `app.disable('x-powered-by')` hides the framework.
- `helmet` with its defaults (including `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`) and an explicit Content Security Policy:

| Directive | Value |
|---|---|
| `default-src` | `'self'` |
| `script-src` | `'self'` (no inline scripts, no `eval`) |
| `style-src` | `'self' 'unsafe-inline' https://fonts.googleapis.com` |
| `font-src` | `'self' https://fonts.gstatic.com` |
| `img-src` | `'self' data:` |
| `connect-src` | `'self' https://fonts.googleapis.com https://fonts.gstatic.com` |
| `object-src` | `'none'` |
| `frame-ancestors` | `'none'` (clickjacking protection) |

Helmet's default directives (such as `base-uri 'self'`, `form-action 'self'`, `script-src-attr 'none'`, `upgrade-insecure-requests`) are merged in. `Cross-Origin-Embedder-Policy` is disabled.

- Every response carries an `X-Request-Id` (`server/src/middleware/requestContext.ts`).

### 2.11 Safe error responses

`server/src/middleware/errorHandler.ts` converts every error into JSON:

- Unknown errors return `500 {"code":"INTERNAL_ERROR","message":"Something went wrong on our side. Please try again."}`. The message and stack trace are written to the server log only, never to the response.
- Known errors (parse errors, Multer errors, `CastError`, malformed or oversized JSON, `HttpError`) map to specific status codes with fixed messages.
- Unknown `/api` routes return `404 NOT_FOUND` with the path but not the query string.
- **Database errors**: credentials embedded in `MONGO_URI` are redacted from connection error messages (`redact` in `server/src/config/database.ts`). When the database is unavailable, `requireDatabase` returns `503 DATABASE_UNAVAILABLE`; the redacted detail is included only outside production (`server/src/middleware/requireDatabase.ts`).

### 2.12 Secrets and configuration

- All secrets are read from environment variables (`server/src/config/env.ts`, loaded with `dotenv`). `server/.env.example` documents them with placeholder values; the real `.env` is not committed.
- **Production start-up validation** (`validateEnv` in `env.ts`, called from `server/src/server.ts`): when `NODE_ENV=production` the process logs `config.invalid` and exits with code 1 if
  - `JWT_SECRET` is missing or shorter than 32 characters (there is no default secret in production),
  - `MONGO_URI` is missing,
  - `DEMO_MODE` is enabled (or `--demo` is passed),
  - `COOKIE_SAMESITE=none` is set without `COOKIE_SECURE=true`,
  - `CLAMAV_REQUIRED=true` is set without `CLAMAV_HOST`.
- `connectDatabase` refuses demo mode in production a second time, independently of validation.

### 2.13 AI integration

Implemented in `server/src/services/aiRewriter.ts` and the `ai-rewrite` route.

- The feature is **disabled unless `ANTHROPIC_API_KEY` is set**. The key is used only on the server and is never sent to the browser; `/api/health` reports only a boolean `aiRewrite`.
- The AI is used **only to reword resume bullet points**. It **never produces or changes a score**; all scoring is deterministic.
- Output is requested in a structured schema and filtered: indices must be valid, text must be non-empty and under 600 characters. Refusals and malformed output are treated as "no suggestions".
- Every rewrite passes the deterministic **fabrication guard** (`server/src/lib/fabricationGuard.ts`), which rejects rewrites that introduce skills, numbers or organisations not present in the resume. Suggestions are only applied when the user accepts them.
- API errors are mapped to generic user messages; the call has a 60 s timeout and one retry. Usage is limited to 10 requests per user per hour.
- Resume text is sent to the external AI provider only when the user explicitly requests AI wording on a deployment where the key is configured.

### 2.14 Audit logging

`server/src/services/auditService.ts` and `server/src/models/AuditLog.ts`.

- Recorded actions: `auth.register`, `auth.login`, `auth.login_failed`, `auth.logout`, `auth.logout_all`, `auth.refresh_reuse_detected`, `profile.update`, `analysis.create`, `analysis.delete`, `resume.fixes_applied`, `resume.version_edit`, `resume.version_restore`, `resume.export`, `report.export`, `application.delete`, `upload.rejected`, `ai.rewrite`.
- Each record stores the user id (when known), action, IP, user agent (truncated to 300 characters), request id, small metadata (e.g. failure reason, error code) and a timestamp.
- **Retention: 180 days** via a TTL index on `createdAt`.
- Audit records **never contain resume content, passwords, tokens or other secrets**.
- Writes are fire-and-forget: a failed audit write is logged (`audit.write_failed`) but never breaks the user request. Each audit event is also emitted to the structured log.

### 2.15 Structured logging

`server/src/observability/logger.ts` and `server/src/middleware/requestContext.ts`.

- JSON lines (one event per line) on stdout (`debug`/`info`) and stderr (`warn`/`error`), with level controlled by `LOG_LEVEL`.
- Every line within a request carries the **request id** (a well-formed incoming `X-Request-Id` of 8 to 64 safe characters is honoured, otherwise a UUID is generated) and, after authentication, the user id.
- **Secret-key redaction**: any field whose key matches `pass(word)?`, `secret`, `token`, `authorization`, `cookie`, `api[-_]?key` or `mongo_?uri` (case-insensitive, nested up to depth 4) is replaced by `[redacted]`.
- Request logs record the path **without the query string**, method, status, duration and client IP. Request bodies and resume text are not logged.

### 2.16 Demo mode

- The in-memory MongoDB (`mongodb-memory-server`) is used only when explicitly requested with `DEMO_MODE=true` or the `--demo` flag (`npm run dev:demo`). There is **no silent fallback**: if the configured MongoDB is unreachable, data routes return `503` instead of using fake storage.
- Demo mode is refused in production (both by `validateEnv` and by `connectDatabase`).

---

## 3. Known limitations / residual risks

| # | Limitation | Impact | Mitigation / recommendation |
|---|---|---|---|
| 1 | **Access tokens are not revoked per request.** The auth middleware verifies the JWT signature and expiry only; it does not check the database. | After logout, "logout everywhere" or refresh-token reuse detection, an already-issued access token remains valid for up to 15 minutes (`ACCESS_TOKEN_TTL`). | Keep the TTL short. A token version or deny list checked per request would close the gap at the cost of a database lookup. |
| 2 | **No multi-factor authentication.** | A stolen password gives full account access. | Rate limiting on login; strong password policy could be added. |
| 3 | **No email verification and no password reset flow.** | Accounts can be registered with addresses the user does not own; a user who forgets the password cannot recover the account. | Out of scope for this project; would require an email provider. |
| 4 | **Timing equalisation is approximate.** The dummy hash uses bcrypt cost 10 while real hashes use cost 12. | An attacker measuring response times may still distinguish unknown emails from known ones. Registration also returns `409` for an existing email, which is a direct enumeration channel. | Generate the dummy hash with the same cost as real hashes; rate limits slow enumeration. |
| 5 | **ClamAV scanning is optional** and disabled by default; when enabled but unreachable, uploads continue unless `CLAMAV_REQUIRED=true`. | Malicious documents are not scanned in a default deployment. Risk is reduced because files are only parsed, never executed, stored or served. | Run clamd and set `CLAMAV_HOST` and `CLAMAV_REQUIRED=true` in production. |
| 6 | **CSP allows `'unsafe-inline'` styles and Google Fonts** origins. | Inline style injection is possible if an HTML injection bug existed; the site depends on a third-party font host. Scripts remain restricted to `'self'`. | Self-host fonts and move to hashed/nonce styles. |
| 7 | **Rate-limit counters are in memory, per process.** | Restarting the process resets counters; running several instances or PM2 cluster mode multiplies the effective limits. | Run a single instance, or configure a shared store (e.g. Redis) for `express-rate-limit`. |
| 8 | **No field-level encryption of resume text at rest.** | Anyone with database access can read resumes. | Use MongoDB encryption at rest (enabled by default on MongoDB Atlas), restrict database users and network access, and use TLS connections. |
| 9 | **XSS would allow actions within the open page session.** Tokens are not in storage, but script running in the page can call the API with the in-memory token. | Limited by React's output escaping and `script-src 'self'`. | Keep the CSP strict for scripts. |
| 10 | **Audit logs and application logs contain IP addresses and user agents.** | These are personal data under privacy law. | Audit records expire after 180 days; apply a retention policy to process logs as well. |
| 11 | **Third-party AI processing** (when enabled) sends resume text to an external provider. | Privacy consideration for users. | The feature is opt-in per deployment and per request; disclose it in the privacy notice. |

See also [limitations.md](limitations.md) for functional limitations.

---

## 4. OWASP Top 10 (2021) mapping

| OWASP 2021 category | Relevant controls in ResumeFit AI | Residual risk |
|---|---|---|
| **A01 Broken Access Control** | `authMiddleware` on all data routes; ObjectId validation; `userId` in every ownership filter; foreign records answered as `404`; CORS restricted to same origin or `CLIENT_URL`; refresh cookie scoped to `/api/auth` (2.4, 2.7). | Access token valid up to 15 min after logout (limitation 1). |
| **A02 Cryptographic Failures** | bcrypt cost 12; HS256 JWT with secret of at least 32 characters enforced in production; refresh tokens 48 random bytes stored as SHA-256; `Secure` cookie and HSTS in production; HTTPS required (2.1 to 2.3, 2.12). | No field-level encryption of resume text (limitation 8). |
| **A03 Injection** | Zod validation; `$`/`.` key stripping; Mongoose typed queries; React output escaping; CSP `script-src 'self'` (2.6, 2.10). | `'unsafe-inline'` styles (limitation 6). |
| **A04 Insecure Design** | Rotating refresh tokens with family reuse detection; deterministic scoring with AI restricted to guarded rewording; no silent fallback to fake data; explicit demo mode (2.3, 2.13, 2.16). | No MFA or account recovery (limitations 2, 3). |
| **A05 Security Misconfiguration** | Production start-up validation; helmet headers and CSP; `x-powered-by` disabled; generic 500 responses; DB details hidden in production (2.10 to 2.12). | Correct `TRUST_PROXY` and HTTPS depend on the deployer ([deployment.md](deployment.md)). |
| **A06 Vulnerable and Outdated Components** | Lockfile (`package-lock.json`) with `npm ci`; CI runs lint, typecheck, tests and build on every push (`.github/workflows/ci.yml`). | No automated dependency vulnerability scanning in CI; run `npm audit` before releases. |
| **A07 Identification and Authentication Failures** | Login rate limit (20 per 15 min); generic login error; timing equalisation; short-lived access tokens; refresh rotation and reuse detection; logout and logout-all (2.1 to 2.3, 2.9). | No MFA; approximate timing equalisation; `409` on duplicate registration (limitation 4). |
| **A08 Software and Data Integrity Failures** | AI output schema-validated and checked by the fabrication guard; user must accept changes; each analysis stores its `scoringVersion`; uploads validated by magic bytes (2.8, 2.13). | None specific beyond dependency trust. |
| **A09 Security Logging and Monitoring Failures** | Audit log for security events (180-day TTL); JSON logs with request ids; secret redaction; rate-limit and upload rejection events logged (2.14, 2.15). | No alerting is configured; logs must be collected by the host (e.g. PM2). |
| **A10 Server-Side Request Forgery** | The server makes outbound requests only to fixed destinations configured by the operator (`MONGO_URI`, `CLAMAV_HOST`, the AI provider SDK, and the Hugging Face model download for research embeddings). No user-supplied URL is fetched (job URLs in the application tracker are stored as text only). | Not applicable beyond operator configuration. |

---

## 5. Where the controls are tested

`server/src/security.test.ts` covers security headers and request ids, safe JSON errors without stack traces, NoSQL operator stripping, the refresh cookie attributes and path, hashed refresh-token storage, the CSRF header requirement, rotation and reuse detection, logout and logout-all revocation, the expired versus invalid token distinction, audited failed logins without enumeration, the 429 response format, the clamd INSTREAM protocol and rejection of flagged files. Ownership and validation behaviour is exercised in `server/src/api.test.ts`. See [testing.md](testing.md) for how to run them.
