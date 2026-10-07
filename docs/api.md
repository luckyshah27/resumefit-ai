# API Reference

All endpoints are under `/api` and exchange JSON unless noted. Source: `server/src/routes/*.ts` and `server/src/app.ts`. Request bodies are validated with Zod; invalid input returns `400` with a message.

## Conventions

**Authentication.** Endpoints marked *auth* need `Authorization: Bearer <access token>`. Access tokens are JWTs (HS256, 15 minutes). The refresh token is an httpOnly cookie (`rf_refresh`, path `/api/auth`) used only by `/auth/refresh` and `/auth/logout`, which also require the header `X-Requested-With: resumefit`.

**Ownership.** Every resource query is filtered by the signed-in user. Another user's ID returns `404`, never `403`, so IDs cannot be probed.

**Rate-limit classes** (`server/src/middleware/rateLimit.ts`). Exceeding a limit returns `429 {code: "RATE_LIMITED"}`.

| Class | Limit | Key |
|---|---|---|
| api | 1,000 / 15 min | IP (all `/api` routes) |
| auth | 20 / 15 min | IP |
| refresh | 120 / 15 min | IP |
| analysis | 30 / hour | user |
| mutation | 120 / hour | user |
| export | 60 / hour | user |
| ai | 10 / hour | user |
| research | 6 / hour | user |

**Common errors**

| Status | Code | Meaning |
|---|---|---|
| 400 | `INVALID_JSON` or a message | Malformed body or failed validation |
| 401 | `AUTH_REQUIRED`, `TOKEN_EXPIRED`, `TOKEN_INVALID` | Missing, expired or invalid access token |
| 403 | `CSRF_CHECK_FAILED` | Refresh/logout without the client header |
| 404 | `NOT_FOUND` | Unknown route or resource (or owned by another user) |
| 413 | `LIMIT_FILE_SIZE`, `PAYLOAD_TOO_LARGE` | File over 5 MB or body over 2 MB |
| 415 / 422 | Parse codes (below) | Rejected upload |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected error (details are logged, never returned) |
| 501 | `AI_DISABLED` | AI wording requested without `ANTHROPIC_API_KEY` |
| 502 | `AI_UNAVAILABLE` | AI provider error |
| 503 | `DATABASE_UNAVAILABLE` | MongoDB not reachable (no silent fallback) |

Upload parse codes: `UNSUPPORTED_TYPE` (415), `MIME_MISMATCH` (415), `FILE_TOO_LARGE` (413), `FILE_TOO_SMALL`, `CORRUPTED_FILE`, `ENCRYPTED_PDF`, `NO_TEXT`, `INFECTED_FILE` (422), `SCAN_UNAVAILABLE` (503).

## Health

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | — | `{status: "ok" \| "degraded", database: {connected, mode, pingMs}, scoringVersion, aiRewrite, uploadScanning, uptimeSeconds}`. `200` when connected, `503` otherwise |

## Auth and profile (`/auth`)

| Method | Path | Auth | Limit | Body / notes | Response |
|---|---|---|---|---|---|
| POST | `/auth/register` | — | auth | `{name, email, password (8–128), targetRole?}` | `201 {token, user}` and sets the refresh cookie; `409` if the email exists |
| POST | `/auth/login` | — | auth | `{email, password}` | `{token, user}` and sets the refresh cookie; `401` for a wrong email or password (same message) |
| POST | `/auth/refresh` | cookie + header | refresh | — | `{token, user}` with a rotated cookie; **`204`** when there is no valid session (no cookie, expired, revoked or reused; reuse revokes the whole session family) |
| POST | `/auth/logout` | cookie + header | — | — | `204`; revokes the session and clears the cookie |
| POST | `/auth/logout-all` | auth | — | — | `204`; revokes every session of the user |
| POST | `/auth/change-password` | auth | mutation | `{currentPassword, newPassword}` | `{message}`; rejects a wrong current password or reuse; revokes all sessions |
| GET | `/auth/me` | auth | — | — | `{user}` |
| PUT | `/auth/profile` | auth | mutation | `{name?, targetRole?, profile?: {phone, location, college, degree, branch, graduationYear, cgpa, linkedin, github, portfolio, bio, preferredLocations}}` | `{user}` |

## Analyses (`/analysis`, auth)

| Method | Path | Limit | Body / query | Response |
|---|---|---|---|---|
| POST | `/analysis` | analysis | `multipart/form-data`: `jobDescription` (80–20,000 chars) and one of `resume` (PDF/DOCX file), `resumeText`, `resumeVersionId`; optional `title` | `201` analysis: `{id, resumeId, resumeVersionId, versionNumber, jobTitle, company, scores, previousAnalysisId, createdAt, jobDescription, practicedQuestionIds, scoringVersion, report}` |
| GET | `/analysis` | — | — | `{analyses: [summary…]}` (newest first, max 100) |
| GET | `/analysis/:id` | — | — | Full analysis including `report` (structured resume and JD, requirement matches, components, costing points, fixes, interview, project analysis) |
| GET | `/analysis/:id/report` | export | `format=pdf` (default) or `json` | PDF analysis report, or the analysis JSON, as a download |
| GET | `/analysis/:id/compare/:otherId` | — | — | `{before, after, comparison: {scores, categories, changedCategories, requirementChanges, attribution}, changes}` — `:otherId` is the earlier analysis |
| POST | `/analysis/:id/fixes` | mutation | `{fixes: [{id, finalText?, confirmed?}], label?}` | `201 {analysis, comparison, changes}` — creates a new version and re-scores it. `422` lists fixes with unfilled placeholders, unconfirmed new claims or fabrication-guard violations |
| POST | `/analysis/:id/rescore` | mutation | — | `{scores, identical, comparison}` — re-runs the engine on the stored inputs |
| POST | `/analysis/:id/ai-rewrite` | ai | — | `{model, rewrites: [{fixId, original, text, accepted, violations}]}`; `501` when not configured |
| PATCH | `/analysis/:id/practice` | mutation | `{questionId, practiced}` | `{practicedQuestionIds, interview, scores}` |
| DELETE | `/analysis/:id` | mutation | — | `204` |
| POST | `/analysis/score` | analysis | `{jobDescription, resumeText}` | Legacy v1, stateless: v1-compatible fields plus `report` |
| POST | `/analysis/upload` | analysis | multipart: `resume` + `payload` JSON `{jobDescription}` | Legacy v1, stateless |

## Resumes and versions (`/resumes`, auth)

| Method | Path | Limit | Body / query | Response |
|---|---|---|---|---|
| GET | `/resumes` | — | — | `{resumes: [{id, title, latestVersionNumber, updatedAt, versions: [summary…]}]}` |
| GET | `/resumes/:resumeId/versions` | — | — | `{resume, versions}` newest first |
| POST | `/resumes/:resumeId/versions` | mutation | `{text, jobDescription?, label?, confirmed?}` | `201 {analysis, comparison}`. `422 {details: {code: "CONFIRMATION_REQUIRED", violations}}` when added lines contain new skills, numbers or organisations and `confirmed` is not true |
| GET | `/resumes/versions/:versionId` | — | — | Version summary plus `text`, `changes`, `breakdown`, `extraction` |
| GET | `/resumes/versions/:versionId/export` | export | `format=docx` (default) or `pdf` | The version's exact content as a file download |
| POST | `/resumes/versions/:versionId/restore` | mutation | — | `201 {analysis, comparison}` — copies the old content into a **new** version; history is never rewritten |
| GET | `/resumes/compare/:a/:b` | — | — | `{older, newer, sameJobDescription, scoreDeltas, categoryDeltas, comparison, changes, diff}` |
| GET | `/resumes/versions/:versionId/analyses` | — | — | Every analysis of that version (for example against different jobs) |

A version summary contains `{id, resumeId, versionNumber, label, source (upload \| paste \| fix \| edit \| restore), fileName, restoredFromVersion, parentVersionId, scores, job, analysisId, scoringVersion, changeCount, createdAt}`.

## Applications (`/applications`, auth)

| Method | Path | Limit | Body | Response |
|---|---|---|---|---|
| GET | `/applications` | — | — | `{applications}` |
| POST | `/applications` | mutation | `{company, role, status?, jobDescription?, jobUrl?, location?, notes?, appliedAt?, deadline?, analysisId?}` | `201` application. With `analysisId`, the server copies Job Fit, resume version and JD from that analysis (clients cannot set scores) |
| PATCH | `/applications/:id` | mutation | Any of the above | Updated application; a status change appends to `statusHistory` |
| DELETE | `/applications/:id` | mutation | — | `204` |

Statuses: `SAVED`, `APPLIED`, `OA` (online assessment), `INTERVIEW`, `SELECTED`, `REJECTED`, `WITHDRAWN`.

## Analytics

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/analytics` | auth | `{totals: {applications, submitted, interviews, offers, rejected, analyses, interviewRate, selectionRate, averageJobFit, averageResumeQuality, averageAtsReadiness, averageApplicationJobFit}, byStatus, fitBands, scoreTrend, recentAnalyses}` |

Interview and selection rates are relative to submitted applications (status not Saved; Withdrawn only if it had been applied).

## Research (`/research`, auth)

| Method | Path | Limit | Response |
|---|---|---|---|
| GET | `/research/dataset` | — | Dataset description, labelling guidelines, jobs and requirements, resume summaries, label counts, method names, default configuration |
| POST | `/research/experiments` | research | Body `{name?, methods?, fixedThresholds?}`. Runs the experiment, stores and returns `{name, config, datasetVersion, results, durationMs}`. `409` if one is already running |
| GET | `/research/experiments` | — | Last 20 runs |

See [research](research.md) for the meaning of the results and [security](security.md) for the controls behind these endpoints.
