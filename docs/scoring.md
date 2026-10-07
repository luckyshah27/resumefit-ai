# Scoring Methodology

This document specifies how ResumeFit AI computes every number it shows. All rules live in `server/src/lib/` and are covered by tests (see [testing](testing.md)). For the extraction steps that produce the inputs, see [ai-pipeline](ai-pipeline.md).

## 1. Principles

1. **Deterministic.** The same resume text, job description and engine version always produce the same report. There is no randomness, no learned model and no network call in the scoring path. `POST /api/analysis/:id/rescore` re-runs the engine and reports whether the result is identical.
2. **Explainable.** Every score is a sum of named components. Each component carries a weight, the points earned, the rule that was applied, the evidence used and a one-sentence summary.
3. **Versioned.** Every report stores `scoringVersion`. Any change that can move a score must bump the version and add a changelog entry (section 9).
4. **AI never scores.** The optional language model only proposes wording. Its output passes the fabrication guard and becomes resume text that is then scored by the same deterministic engine.
5. **Three independent scores.** Job Fit (fit to this job), ATS Readiness (parsing risk) and Resume Quality (writing and evidence quality) are computed separately and never blended into a single number. Interview Readiness is a fourth, derived score.

## 2. Evidence strength

Each skill found in the resume is graded by where it appears (`gradeEvidence` in `resumeStructurer.ts`):

| Strength | Rule |
|---|---|
| **HIGH** | Used in a descriptive bullet of a project, internship or experience entry (the bullet starts with a strong action verb or has at least 8 words), or evidenced in two or more distinct project/internship/experience entries |
| **MEDIUM** | Appears in a project/internship/experience entry only in a tech-stack line, or in a certification or achievement |
| **LOW** | Only listed in the Skills, Summary, Education or other sections |

Skills implied by evidenced skills (for example Next.js → React, Express → Node.js) inherit the strength of the implying skill.

## 3. Requirement matching

Each JD skill requirement receives exactly one state (`matchingEngine.ts`):

| State | Condition | Credit |
|---|---|---|
| `STRONG_MATCH` | Skill present with HIGH evidence | 100% |
| `MATCH` | Skill present with MEDIUM evidence | 80% |
| `WEAK_EVIDENCE` | Skill present with LOW evidence (only listed) | 40% |
| `PARTIAL_MATCH` | Skill absent, but a related skill is present with at least MEDIUM evidence | similarity × cap |
| `MISSING` | Neither the skill nor a related skill is evidenced | 0% |

**Partial matches can never become matches.** For a mandatory, specific technology (any category except concepts and soft skills) the cap is `MANDATORY_TECH_PARTIAL_CAP = 0.5`; otherwise it is 0.8. With a relational-database similarity of 0.6, MySQL for a mandatory PostgreSQL requirement earns 0.6 × 0.5 = 30% and is reported as “transferable only — still a gap”. `exactMatch`, `semanticMatch`, `evidenceStrength` and `finalMatchState` are stored separately for every requirement.

**Requirement weights inside a category:** soft skills 0.5, concepts 0.8, all other skills 1.0.

## 4. Job Fit

### 4.1 Components and base weights

| Component | Base weight | Rule |
|---|---|---|
| Mandatory skills | 45 | Weighted average credit of mandatory skill requirements |
| Preferred skills | 15 | Same rule for preferred requirements |
| Responsibility alignment | 15 | Average credit of JD responsibilities (4.2) |
| Project & experience relevance | 10 | Average JD-technology overlap of the two most relevant projects/internships/jobs; 3 overlapping technologies = full credit for an entry; a missing second entry counts as 0 |
| Experience level | 8 | min(1, candidate years ÷ required minimum); candidate years = (full-time months + 50% of internship months) ÷ 12 |
| Education | 7 | 70% if the highest degree meets the required level, plus 30% if the field matches (or no field is required) |

**Applicability and renormalisation.** A component that does not apply to the job is excluded and the remaining base weights are rescaled to sum to 100. Preferred skills do not apply when the JD lists none. Experience does not apply when the JD requires no prior experience: “Freshers welcome”, “0–2 years” and similar give a minimum of 0, so **freshers are not penalised**. Education does not apply when no degree is stated.

### 4.2 Responsibility alignment

For each JD responsibility, the engine takes its stemmed content keywords (generic verbs such as “build” or “develop” excluded) and finds the resume bullet with the highest keyword coverage. If the responsibility names skills, coverage = 0.5 × keyword coverage + 0.5 × skill coverage (a skill with LOW evidence counts half). States: coverage ≥ 0.7 strong (100%), ≥ 0.5 match (80%), ≥ 0.3 partial (50%), > 0.1 weak (25%), otherwise missing (0%).

### 4.3 Worked example (verified sample, engine 2.1.0)

Sample full-stack JD (`samples/sample-job-description-fullstack.txt`) and sample resume (`samples/sample-resume.pdf`). Experience is not applicable (0–2 years), so the other five weights are rescaled.

| Component | Weight | Ratio | Earned |
|---|---|---|---|
| Mandatory skills | 48.9 | 70% | 34.1 |
| Preferred skills | 16.3 | 33% | 5.3 |
| Responsibility alignment | 16.3 | 65% | 10.6 |
| Project & experience relevance | 10.9 | 100% | 10.9 |
| Experience level | n/a | — | — |
| Education | 7.6 | 100% | 7.6 |
| **Job Fit** | **100** | | **68.5** |

Requirement states in this example:

| Requirement | JD wording | Importance | Evidence | State | Credit |
|---|---|---|---|---|---|
| React | “React” | Mandatory | HIGH | Strong match | 100% |
| TypeScript | “TypeScript” | Mandatory | MEDIUM | Match | 80% |
| REST API | “RESTful APIs” | Mandatory | HIGH | Strong match | 100% |
| Node.js | “Node.js” | Mandatory | HIGH | Strong match | 100% |
| Express.js | “Express” | Mandatory | HIGH | Strong match | 100% |
| PostgreSQL | “Postgres” | Mandatory | LOW | Weak evidence | 40% |
| Unit Testing | “unit tests” | Mandatory | HIGH | Strong match | 100% |
| Agile | “Agile” | Mandatory | — | Missing | 0% |
| JavaScript | “JavaScript” | Mandatory | HIGH | Strong match | 100% |
| Go | “GoLang” | Mandatory | — | Missing | 0% |
| Git | “Git” | Mandatory | LOW | Weak evidence | 40% |
| Docker | “Docker” | Preferred | LOW | Weak evidence | 40% |
| AWS | “AWS” | Preferred | MEDIUM | Match | 80% |
| Redis | “Redis” | Preferred | — | Missing | 0% |
| Caching | “caching” | Preferred | — | Missing | 0% |
| GraphQL | “GraphQL” | Preferred | — | Transferable only (via REST API) | 36% |

## 5. “What is costing me points?”

Every point not earned is attributed. For a skill requirement *i* in a component of weight *W*:

```
loss_i = W × (w_i / Σw) × (1 − credit_i)
```

Losses are grouped by cause (“Mandatory skill missing”, “… with weak evidence”, “… only transferable”, “… not shown in depth”, “Responsibility mismatch”, “Weak project/experience relevance”, “Experience below requirement”, “Education mismatch”). For the example above:

| Points | Cause | Items |
|---|---|---|
| −8.4 | Mandatory skill missing | Agile (3.7), Go (4.6) |
| −6.1 | Preferred skill missing | Redis (3.4), Caching (2.7) |
| −5.7 | Responsibility mismatch | PostgreSQL queries/migrations (2.4), Agile collaboration (3.3) |
| −5.5 | Mandatory skill with weak evidence | PostgreSQL (2.8), Git (2.8) |
| −2.2 | Preferred skill only transferable | GraphQL (2.2) |
| −2.0 | Preferred skill with weak evidence | Docker (2.0) |
| −0.9 | Mandatory skill not shown in depth | TypeScript (0.9) |
| −0.7 | Preferred skill not shown in depth | AWS (0.7) |
| **−31.5** | | 68.5 + 31.5 = 100 |

Rounding drift of at most 0.5 is assigned to the largest loss so that the losses always sum exactly to 100 − score. ATS Readiness and Resume Quality losses are reported per check and component in the same way.

## 6. ATS Readiness

ATS Readiness estimates **potential parsing risk**. It is not the output of any real applicant tracking system, and the report says so (`ATS_DISCLAIMER`). Language is always “Potential parsing risk: …”, never “will fail”.

| Check | Weight | Rule |
|---|---|---|
| Text extractability | 20 | 0 if < 200 characters were extracted (likely image-only); 50% if a PDF yields < 400 characters per page; −30% if > 2% unusual glyphs; −20% if ≥ 5 run-together words; −20% if ≥ 2 letter-spaced lines (2.1.0) |
| Standard section headings | 12 | Share of Education, Skills and Experience/Internships/Projects headings found, −10% per non-standard heading |
| Contact information | 12 | Email 5, phone 4, LinkedIn/GitHub 3 |
| Skills section | 10 | Absent 0; fewer than 6 parseable items 60%; otherwise full |
| Experience / internships | 8 | At least one entry |
| Projects | 8 | Two or more 100%; one 60% |
| Education | 8 | Recognised degree 100%; section without a degree 50% |
| Dates | 7 | Share of entries with parseable dates; −20% if more than two date formats |
| Formatting risks | 7 | −40% tables, −20% images, −40% suspected multi-column layout, −20% more than two very long lines |
| JD keyword alignment | 8 | Mandatory JD terms written with the JD's exact wording; alias-only matches earn half credit; not applicable when the JD has no mandatory skills |

Weights are renormalised over applicable checks. Pasted text has no file, so table, image and column checks cannot detect anything for it, and the analysis page says so.

## 7. Resume Quality

| Component | Weight | Rule |
|---|---|---|
| Completeness | 15 | Email or phone 2, education 3, skills 3, projects 3, experience or internships 2, summary 1, profile links 1 |
| Readability | 10 | 40% for 5+ bullets, 30% × share of bullets with 8–30 words, 30% for a total of 250–900 words |
| Technical specificity | 15 | Share of bullets naming a technology; 60% earns full marks |
| Project quality | 15 | Average score of the top three projects (8.1) |
| Internship / experience quality | 10 | Average entry score (8.1); a 30% baseline when there is none |
| Action verbs | 10 | Share of bullets starting with a strong verb; 80% earns full marks |
| Measurable outcomes | 10 | Share of bullets with a number; 40% earns full marks |
| Consistency | 5 | One bullet style 30%, at most two date formats 40%, no duplicate bullets 30% |
| Relevance | 10 | Share of mandatory JD skills demonstrated beyond the skills list |

Example values (same sample): completeness 15.0, readability 9.6, specificity 15.0, projects 8.2, internships 8.7, action verbs 6.3, outcomes 9.4, consistency 5.0, relevance 6.4 = **83.6**.

## 8. Project, internship and interview scores

### 8.1 Projects and internships

Each dimension is scored 0–10 and combined by weight into 0–100 (`projectAnalysis.ts`).

| Projects | Weight | Internships / experience | Weight |
|---|---|---|---|
| Technical depth | 20 | Duration (3 months = full) | 10 |
| Technologies | 10 | Technologies used | 15 |
| Relevance to JD | 20 | Relevance to JD | 20 |
| Complexity | 15 | Measurable impact | 20 |
| Implementation evidence | 15 | Ownership & action | 20 |
| Measurable outcome | 10 | Clarity | 15 |
| Clarity | 10 | | |

Informational flags (generic wording such as “worked on various tasks”, no technologies, no measurable impact, missing dates), final-year-project detection and internship role relevance are reported but **not scored**, so they cannot penalise a fresher twice.

### 8.2 Interview Readiness

| Component | Weight |
|---|---|
| Technical evidence for mandatory skills (average credit) | 30 |
| Project depth (top two projects) | 20 |
| Internship stories (30% baseline if none) | 10 |
| Exposure to gap questions (share of mandatory skills not missing) | 15 |
| Behavioural evidence (teamwork, leadership/ownership, achievements) | 10 |
| Practice progress (questions marked practised) | 15 |

Question priority: HIGH = mandatory requirement missing, weak or only transferable; MEDIUM = mandatory requirement matched without depth, or a preferred gap; LOW = already strong.

## 9. Integrity guarantees and versioning

The following invariants are enforced by `server/src/lib/scoreIntegrity.test.ts` over 61 reports (the sample plus every job × resume pair of the research dataset):

- sum of component points == final score, for Job Fit, ATS Readiness, Resume Quality and Interview Readiness;
- sum of lost points == 100 − final score, for Job Fit, ATS Readiness and Resume Quality;
- applicable weights sum to 100, and every component has a rule and evidence;
- every report carries the scoring version.

The same file pins the verified example: Job Fit 68.5 (displayed 69), ATS Readiness 99.3, Resume Quality 83.6; after the deterministic fixes plus one user-confirmed evidence bullet, Job Fit 73.7 and Resume Quality 89.5.

### Changelog (`SCORING_CHANGELOG` in `scoringEngine.ts`)

| Version | Change |
|---|---|
| 1.0.0 | Initial keyword-based engine with a hard-coded requirement list |
| 2.0.0 | Structured resume/JD extraction, evidence-graded five-state matching, separate ATS Readiness and Resume Quality, point-loss attribution |
| 2.1.0 | ATS extractability also deducts for malformed extraction (run-together words, letter-spaced text). No other weights changed |

The project brief asked to keep the version at 1.0.0 unless weights changed. Version 2.0.0 already replaced the 1.0.0 engine during the second development phase, which is itself a scoring change, and 2.1.0 adds one rule. The verified example scores are identical under 2.0.0 and 2.1.0.

## 10. Fix suggestions and re-scoring

Every suggestion carries current text, suggested text, reason, target requirement, evidence used and a **confidence**:

| Confidence | Suggestion types | Meaning |
|---|---|---|
| High | Weak opening verb, JD wording alignment, heading rename | Rewords the user's own text; no facts added; passes the fabrication guard |
| Medium | Targeted summary | Built only from skills already evidenced in the resume |
| Low | Add evidence, add metric, cover a responsibility, add profile links, add a missing skill | Template with `[placeholders]` or a new claim; cannot be applied until the user fills it in and/or confirms it is true |

Any suggestion that fails the fabrication guard is forced to low confidence. Applying fixes creates a new immutable version; re-scoring calls the same `runAnalysis` used for the first analysis. Before/after deltas are differences between two engine outputs. Change attribution only links each difference to the edits that touched it (by skill mention or by the component a fix type targets); it never computes or adjusts a delta.
