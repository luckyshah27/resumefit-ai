# ResumeFit AI

**An Explainable AI-Based Job-Specific Resume Evaluation, Gap Analysis and Optimization System for Final-Year Students**

B.Tech final-year major project · MERN stack (MongoDB, Express, React, Node.js) · TypeScript end to end

---

## Abstract

Final-year students and freshers usually apply to many roles with one generic resume and receive no feedback on why it does or does not fit a particular job. Existing tools either give opaque keyword scores or rewrite resumes with generative AI that can introduce claims the candidate cannot defend. ResumeFit AI compares a real resume (PDF or DOCX) with a specific job description and produces three independent, explainable scores — **Job Fit**, **ATS Readiness** and **Resume Quality** — using a deterministic, versioned scoring engine. An NLP pipeline converts both documents into structured data: the resume into sections, projects, internships and skills graded by the strength of their evidence, and the job description into mandatory and preferred requirements normalised through a skill ontology. Every requirement is classified as a strong match, match, transferable (partial) match, weak evidence or missing, and every lost point is attributed to a specific requirement or rule. The system then suggests fact-preserving fixes, guarded against fabricated technologies, numbers or organisations, saves each edit as an immutable resume version and re-scores it with the same engine to show what improved. Interview preparation, application tracking and analytics complete the workflow. A research module compares keyword matching, TF-IDF similarity and sentence-embedding similarity with the ontology engine on a small hand-labelled dataset; on that constructed dataset the ontology engine achieved the highest observed F1 (0.969). See [docs/abstract.md](docs/abstract.md).

## Problem statement

Freshers lack (1) a job-specific view of how their resume matches a role, (2) an explanation of *why* a score is what it is, (3) a safe way to improve the resume without inventing experience, and (4) a way to track whether changes actually help. Details: [docs/problem-statement.md](docs/problem-statement.md).

## Objectives

- Parse real PDF/DOCX resumes and job descriptions into structured data.
- Score job fit deterministically, with evidence for every point awarded or lost.
- Keep Job Fit, ATS Readiness and Resume Quality separate and explainable.
- Suggest improvements that never fabricate facts; save versions and re-score them.
- Support the rest of the job search: interview preparation, application tracking, analytics.
- Evaluate matching methods empirically and report results conservatively.

Full list: [docs/objectives.md](docs/objectives.md).

## Key features

| Area | What it does |
|---|---|
| Resume upload | PDF and DOCX, validated by extension, MIME type and file signature; 5 MB limit; corrupted, password-protected and image-only files rejected with clear messages; optional ClamAV scanning |
| Structured extraction | Candidate, education, skills (with evidence and HIGH/MEDIUM/LOW strength), experience, internships, projects, certifications, achievements, links, final-year-project and fresher signals |
| JD analysis | Role, seniority, experience, education, mandatory/preferred skills (original phrase → canonical skill, e.g. “Postgres” → PostgreSQL), responsibilities, tools, domain keywords |
| Matching | Five states — STRONG_MATCH, MATCH, PARTIAL_MATCH, WEAK_EVIDENCE, MISSING. Related technologies (MySQL for PostgreSQL) can only be a capped partial match and stay a gap |
| Three scores | **Job Fit**, **ATS Readiness** (“potential parsing risk” language), **Resume Quality**, plus Interview Readiness |
| Why this score | Each category's points, weight, rule and evidence; categories sum exactly to the score |
| What is costing me points | Every lost point attributed to a requirement or rule; losses sum exactly to 100 − score |
| Fix my resume | Current text, suggested text, reason, target requirement, evidence used, confidence. New claims need placeholders filled in and explicit confirmation |
| Versions | Immutable versions, compare (text diff + score deltas + which edits caused them), restore as a new version, download as DOCX or PDF |
| Re-score | Same deterministic engine; before → after → delta, per category |
| Interview prep | Technical, project, role-specific, behavioural, system-design and gap questions with HIGH/MEDIUM/LOW preparation priority |
| Applications | Saved, Applied, Online Assessment, Interview, Selected, Rejected, Withdrawn, with a status timeline and linked resume version + score |
| Analytics | Applications, interviews, offers, rejections, interview and selection rates, average Job Fit, Resume Quality and ATS Readiness |
| Research | Keyword vs TF-IDF vs MiniLM embeddings vs ontology engine: precision, recall, F1 with bootstrap CIs, nDCG, P@k, MRR, MAP |
| Reports | Downloadable analysis report (PDF or JSON) |
| Optional AI wording | Claude rewording of weak bullets when `ANTHROPIC_API_KEY` is set; every rewrite passes the same fabrication guard and the AI never produces a score |

## Architecture

```
React (Vite) ──► Express API ──► Auth (JWT access + rotating refresh cookie)
                     │
                     ├─► Resume parser (validate → scan → PDF/DOCX text)
                     ├─► JD analyzer ─┐
                     │                ├─► Matching engine ─► Scoring engine ─► Gap analysis ─► Fix suggestions
                     │                │        (deterministic scoring boundary)                    ▲
                     │                │                                                            │ fabrication guard
                     │                └──────────────────────────────── Optional AI wording ───────┘ (never scores)
                     └─► MongoDB (users, resumes, versions, analyses, applications, experiments, tokens, audit logs)
```

**AI ≠ final scoring authority.** Diagrams, data flow and module map: [docs/architecture.md](docs/architecture.md) · NLP pipeline: [docs/ai-pipeline.md](docs/ai-pipeline.md) · Data model: [docs/database.md](docs/database.md) · Endpoints: [docs/api.md](docs/api.md).

## Technology stack

| Layer | Technology |
|---|---|
| Client | React 18, Vite, TypeScript, Tailwind CSS, Recharts, React Router |
| Server | Node.js, Express 4, TypeScript, Zod, Multer, Helmet, express-rate-limit |
| Data | MongoDB with Mongoose (mongodb-memory-server for tests and explicit demo mode) |
| Auth | bcrypt, JWT (15-minute access tokens), opaque rotating refresh tokens in httpOnly cookies |
| Documents | pdf-parse (pdf.js) and mammoth for parsing; docx and pdfkit for export |
| Research | In-house TF-IDF; all-MiniLM-L6-v2 sentence embeddings via transformers.js (local CPU) |
| Optional AI | Anthropic Claude API (`claude-opus-5-5`), structured output, server-side only |
| Quality | Vitest, Supertest, Testing Library, Playwright, axe-core, ESLint, GitHub Actions |

## System workflow

Register → candidate profile → paste JD → upload PDF/DOCX → parse → structured resume + structured JD → matching → Job Fit / ATS Readiness / Resume Quality → why this score → requirement gaps → what is costing points → fix my resume → new version → re-score → before/after → interview preparation → save application → analytics → research evaluation.

## Scoring methodology

Job Fit weights (renormalised over the categories that apply to the job): mandatory skills 45, preferred skills 15, responsibility alignment 15, project & experience relevance 10, experience level 8, education 7. Evidence decides credit: a skill that appears only in the Skills list earns 40%, one used in a project or internship bullet earns 100%. Experience is not scored when the job accepts freshers.

The engine is deterministic and versioned (current **scoring version 2.1.0**). Tests enforce, across 61 reports, that category scores sum to the final score and lost points equal 100 − score, and pin the verified example (Job Fit 68.5 → 73.7, ATS 99.3, Resume Quality 83.6 → 89.5). Full rules and changelog: [docs/scoring.md](docs/scoring.md).

## Research methodology

Dataset: 6 synthetic job descriptions × 10 synthetic resumes, 470 requirement labels and 60 graded relevance labels, labelled by a single annotator. Thresholds for TF-IDF and embeddings are chosen by leave-one-job-out cross-validation, never on the examples they are scored on; 95% confidence intervals come from a seeded bootstrap. Requirement-detection F1 on this dataset: keyword 0.849, TF-IDF 0.918, MiniLM 0.893, ontology engine 0.969. The dataset is small and synthetic, so these results describe relative behaviour, not production accuracy. Reproduce with `npm run research` (writes [research/results.json](research/results.json)). Details: [docs/research.md](docs/research.md).

## Setup

Requirements: Node.js 20.10+ (tested on 22 and 24), npm 10+. MongoDB is optional for local demos.

```bash
npm install
npm run samples          # sample PDF/DOCX resume + job descriptions in samples/

# Quick demo (explicit in-memory database, data lost on restart, banner shown in the UI)
npm run dev:demo         # API on http://localhost:5000
npm run dev:client       # app on http://localhost:5173

# With a real MongoDB
cp server/.env.example server/.env   # set your own local MONGO_URI and JWT_SECRET; never commit this file
npm run dev
npm run dev:client
```

Open http://localhost:5173, create an account, click **Use example** on the Analyze page and upload `samples/sample-resume.pdf`.

## Environment variables

All configuration lives in [server/.env.example](server/.env.example); nothing environment-specific is hard-coded.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `production` enables strict start-up validation and secure cookies |
| `PORT` | API port (default 5000) |
| `MONGO_URI` | MongoDB connection string (required in production) |
| `JWT_SECRET` | ≥ 32 random characters (required in production) |
| `CLIENT_URL` | Allowed cross-origin client URLs (empty when the server serves the client) |
| `SERVER_URL` | Public API URL (informational) |
| `SERVE_CLIENT` | `true` = serve `client/dist` from the API (single origin) |
| `TRUST_PROXY` | Number of reverse proxies (1 behind NGINX/Hostinger) |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE`, `COOKIE_SAMESITE` | Session settings |
| `ANTHROPIC_API_KEY` | Optional AI wording |
| `CLAMAV_HOST`, `CLAMAV_PORT`, `CLAMAV_REQUIRED` | Optional upload scanning |
| `DEMO_MODE` | Local demos only; refused in production |
| `LOG_LEVEL` | JSON log level |

## Testing

```bash
npm run lint            # ESLint (server + client)
npm run typecheck       # TypeScript (server incl. tests, client)
npm test                # server unit/API/security/research tests + client tests
npm run test:e2e:install   # once: Playwright Chromium
npm run test:e2e        # builds, then Playwright on the production build
npm run verify          # all of the above
```

Coverage of requirements by tests, and the CI pipeline: [docs/testing.md](docs/testing.md). Security controls: [docs/security.md](docs/security.md).

## Deployment

Build once and run a single Node process that serves both the API and the React app:

```bash
npm ci && npm run build
NODE_ENV=production SERVE_CLIENT=true TRUST_PROXY=1 MONGO_URI=... JWT_SECRET=... npm start
```

Hostinger (VPS or Node.js hosting), MongoDB Atlas, HTTPS and the post-deploy checklist: [docs/deployment.md](docs/deployment.md). Without a reachable database the API answers `503 DATABASE_UNAVAILABLE`; in production it refuses to start without `MONGO_URI` and `JWT_SECRET`.

## Limitations

Rule-based section detection can mis-read unusual layouts; scanned resumes are rejected rather than OCR'd; the skill ontology (141 skills) has gaps; scoring weights are expert-set rather than learned from hiring outcomes; ATS Readiness is an estimate; the research dataset is small, synthetic and single-annotator. Full list: [docs/limitations.md](docs/limitations.md) · Future work: [docs/future-scope.md](docs/future-scope.md).

## Documentation index

[Abstract](docs/abstract.md) · [Problem statement](docs/problem-statement.md) · [Objectives](docs/objectives.md) · [Existing system](docs/existing-system.md) · [Proposed system](docs/proposed-system.md) · [Architecture](docs/architecture.md) · [Database](docs/database.md) · [API](docs/api.md) · [Scoring](docs/scoring.md) · [AI pipeline](docs/ai-pipeline.md) · [Research](docs/research.md) · [Testing](docs/testing.md) · [Security](docs/security.md) · [Deployment](docs/deployment.md) · [Limitations](docs/limitations.md) · [Future scope](docs/future-scope.md) · [Screenshots](docs/screenshots/)

All resumes, job descriptions and research data in this repository are synthetic.
# resumefit-ai
Explainable AI-based, job-specific resume evaluation, gap analysis, optimization and interview preparation platform for final-year students.
