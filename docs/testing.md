# Testing

ResumeFit AI is verified at four levels: unit tests of the engine, API integration tests against a real (in-memory) MongoDB, client component tests, and Playwright end-to-end tests against the production build. Lint and typecheck run on every change, and CI runs everything on each push.

## 1. Commands

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint (TypeScript rules, no `any`, no `console`, React hooks rules) for server and client |
| `npm run typecheck` | `tsc` for the server (including tests) and `tsc -b` for the client |
| `npm test` | Server tests (Vitest) then client tests (Vitest + Testing Library + jsdom) |
| `npm run test:e2e:install` | Once per machine: downloads Playwright's Chromium |
| `npm run test:e2e` | Builds client and server, starts the production server (single origin, explicit demo database) and runs Playwright |
| `npm run verify` | All of the above in order |
| `npm run research` | Runs the research experiment and writes `research/results.json` |

No production secrets are needed: integration tests start `mongodb-memory-server`, and the E2E web server uses demo mode with a test-only JWT secret.

## 2. Inventory

Counts are taken from the test runners' JSON reports.

### 2.1 Server: 141 tests in 15 files

| File | Tests | Covers |
|---|---|---|
| `src/api.test.ts` | 22 | Full HTTP flow with supertest + in-memory MongoDB: register/login/profile, real PDF and DOCX upload, corrupted upload, fabricated-claim refusal, fixes → new version → re-score, determinism, versions/compare/restore, interview practice, applications, analytics, exports, version immutability, manual-edit confirmation, attribution, Withdrawn status, user isolation, 503 without a database |
| `src/security.test.ts` | 15 | Security headers and request ids, safe errors, NoSQL operator stripping, refresh cookie attributes, hashed token storage, CSRF header, rotation and reuse detection, logout and logout-all, expired vs invalid vs `alg:none` tokens, failed-login auditing without enumeration, rate-limit 429, clamd protocol, infected-file rejection |
| `src/lib/skillOntology.test.ts` | 16 | Alias normalisation (GoLang, Postgres, RESTful APIs, Mongo, K8s, sklearn…), Java vs JavaScript, React Native vs React, Spring Boot vs Spring, the ambiguous word “Go”, “rest of the team”, implications, related skills |
| `src/lib/resumeStructurer.test.ts` | 11 | Contact details, sections, education, internships, projects, evidence strength rules, profile URLs not counted as skills, PDF line-wrap repair, non-standard headings |
| `src/lib/jdExtractor.test.ts` | 7 | Role, company, seniority, experience, education, mandatory vs preferred, original phrases, responsibilities, cue words |
| `src/lib/matchingEngine.test.ts` | 7 | Match states, separate exact/semantic/evidence fields, MySQL never satisfies PostgreSQL, loss attribution sums, weight renormalisation, determinism, evidence raising the score |
| `src/lib/qualityAndAts.test.ts` | 9 | ATS clean resume, parsing-risk language, contact/heading penalties, alias half credit, malformed extraction (2.1.0), project and internship analysis, quality dimensions, action verbs |
| `src/lib/fixSuggestions.test.ts` | 9 | Fabrication guard (new skill/number/entity), placeholders, required suggestion fields, auto-applicable fixes pass the guard, confirmation for missing skills, refusal of unfilled placeholders, re-score deltas |
| `src/lib/finalYearFeatures.test.ts` | 8 | Final-year project, hackathon, competitive programming, open source, coursework detection; generic internship flags and role relevance; fresher fairness; component summaries; fix confidence; interview priorities; change attribution |
| `src/lib/scoreIntegrity.test.ts` | 5 | Regression pin of the verified example; score = sum of components and losses = 100 − score over 61 reports; weights sum to 100; scoring version present |
| `src/lib/scoringEngine.test.ts` | 6 | v1-compatible wrapper, three independent scores, loss sums, project analysis, full determinism |
| `src/lib/interviewAndCompare.test.ts` | 4 | Question categories, grounding in resume and JD, readiness rising with practice, line diff |
| `src/research/research.test.ts` | 8 | Precision/recall/F1, nDCG/P@k/MRR/MAP, reproducible bootstrap, TF-IDF, method behaviour, full experiment with a deterministic fake embedder, unavailable-model reporting |
| `src/services/resumeParser.test.ts` | 9 | Real PDF and DOCX extraction, generic MIME, unsupported type, MIME mismatch, renamed files, size limits, corrupted PDF, image-only PDF |
| `src/services/exportService.test.ts` | 5 | Text → blocks without loss, DOCX and PDF round trips (export → re-parse → same structure), font-safe characters, report PDF content |

### 2.2 Client: 17 tests in 6 files

| File | Tests | Covers |
|---|---|---|
| `src/api/client.test.ts` | 4 | Refresh-and-retry on an expired access token, session end on invalid refresh, CSRF header and 204 handling, friendly network errors |
| `src/components/ui.test.tsx` | 4 | Signed deltas, text labels for match states, accessible score ring, score bands |
| `src/components/results/results.test.tsx` | 3 | “Why this score” sum line and fresher note; attribution collapse and empty state |
| `src/components/PasswordField.test.tsx` | 2 | Accessible show/hide password button; strength labels from the defined criteria |
| `src/pages/AuthPassword.test.tsx` | 2 | Login password show/hide; independent visibility controls and mismatch rejection on registration |
| `src/pages/RequirementsPanel.test.tsx` | 2 | JD wording shown next to canonical requirement; filtering by state |

### 2.3 End-to-end: 8 Playwright tests in 3 files

Run against the production build served by Express (one origin) with the explicit demo database. A shared fixture fails any test that produces a browser console error or an uncaught page error.

| File | Tests | Covers |
|---|---|---|
| `e2e/tests/core-flow.spec.ts` | 3 | Complete journey: register → sign out → sign in → profile → JD + real PDF → Job Fit 69 / ATS 99 / Quality 84 → “why” sum (68.5) → missing and weak requirements → costing points → fixes with a confirmed evidence bullet → version 2 with 68.5 → 73.7 (+5.2) and attribution → DOCX and report downloads → interview priorities and practice → save application → move to Interview → compare versions → analytics. Plus invalid-upload message and auth guard / unknown-analysis error |
| `e2e/tests/responsive.spec.ts` | 4 | Mobile 390 px, tablet 820 px, desktop 1440 px: no horizontal overflow on key pages, readable score cards, navigation (hamburger on mobile), modals fit the screen; keyboard focus visible |
| `e2e/tests/password-security.spec.ts` | 1 | Strength meter, show/hide on every password field, mismatch and wrong-current-password errors, successful change that ends the session and requires signing in with the new password |

Accessibility: `axe-core` scans the results page, dashboard and every responsive page for WCAG 2 A/AA violations; any serious or critical violation fails the test.

## 3. Strategy

- **Engine first.** The scoring engine is pure TypeScript with no I/O, so most guarantees are fast unit tests over real sample text.
- **Real files, not mocks.** Parser and export tests generate genuine PDF (pdfkit) and DOCX (docx) files and parse them with the production code.
- **Real database.** API tests run against MongoDB itself (`mongodb-memory-server`), including the failure path where the database disconnects.
- **Invariants over many inputs.** Score integrity is checked on every job × resume pair of the research dataset, not just one example.
- **Regression pin.** The verified example is pinned; changing it requires a scoring-version bump.
- **Offline research tests.** A deterministic character-trigram embedder replaces MiniLM in unit tests; the real model is used by `npm run research` and the Research page.

## 4. Traceability

| Requirement | Verified by |
|---|---|
| Deterministic, versioned scoring | `scoringEngine.test.ts`, `scoreIntegrity.test.ts`, `api.test.ts` (re-score identical) |
| Category points sum to the score; losses equal 100 − score | `scoreIntegrity.test.ts`, `matchingEngine.test.ts` |
| Skill only in Skills ≠ full credit; MySQL ≠ PostgreSQL | `resumeStructurer.test.ts`, `matchingEngine.test.ts` |
| No fabricated facts; placeholders and confirmation | `fixSuggestions.test.ts`, `api.test.ts` (422 for unconfirmed claims and unfilled placeholders, manual-edit confirmation) |
| Immutable versions; restore creates a new version | `api.test.ts` |
| Before/after computed by the same engine, with attribution | `fixSuggestions.test.ts`, `finalYearFeatures.test.ts`, `api.test.ts`, E2E core flow |
| Fresher fairness | `finalYearFeatures.test.ts` |
| Upload validation and rejection | `resumeParser.test.ts`, `api.test.ts`, `security.test.ts`, E2E invalid upload |
| Resume and report export | `exportService.test.ts`, `api.test.ts`, E2E downloads |
| Refresh-token rotation, reuse detection, revocation | `security.test.ts`, `client.test.ts`, E2E password change |
| Rate limiting | `security.test.ts` |
| 503 when the database is unavailable | `api.test.ts` |
| Research metrics correctness | `research.test.ts` |
| Responsive layout, accessibility, zero console errors | E2E `responsive.spec.ts`, `core-flow.spec.ts` |

## 5. Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests:

1. **quality:** `npm ci` → lint → typecheck → server tests → client tests → build (Node 22, with npm and MongoDB-binary caching).
2. **e2e** (after quality): installs Chromium with system dependencies and runs `npm run test:e2e`; the Playwright report and traces are uploaded when it fails.

Local verification of the final state is recorded in the project summary: lint and typecheck clean; 141 server, 17 client and 8 E2E tests passing; production build successful.
