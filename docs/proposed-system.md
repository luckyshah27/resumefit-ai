# Proposed System

ResumeFit AI evaluates a real resume against a specific job description, explains every point of the result, identifies gaps, and helps the candidate improve the resume without inventing facts. Each improvement is saved as a new version and re-scored by the same deterministic engine. The overall architecture is described in [Architecture](architecture.md); this document summarises the functional design.

## Design Principles

1. **Deterministic, versioned scoring.** The same inputs and scoring version always produce the same scores. The current scoring version is **2.1.0**.
2. **Explainability.** Every score is broken into weighted components, and the points lost in each score are itemised so that they sum exactly to 100 minus the score.
3. **Evidence over keywords.** A skill demonstrated in project or internship work earns more credit than a skill that is only listed.
4. **Fact preservation.** Suggestions never add unconfirmed claims; new facts require placeholders and explicit user confirmation.
5. **AI is assistive, not authoritative.** The optional language model may reword text only. It never produces or changes a score.

## Processing Pipeline

| Stage | Description | Main module (under `server/src/`) |
|-------|-------------|-------------|
| 1. Input | Job description text and a real PDF or DOCX resume. | `routes/analysisRoutes.ts` |
| 2. Validation | Extension, MIME type and magic-byte checks; 5 MB size limit; rejection of corrupted, password-protected and image-only files; optional ClamAV scan. | `services/resumeParser.ts`, `services/fileScanner.ts` |
| 3. Text extraction | pdf-parse (pdf.js) for PDF and mammoth for DOCX, with extraction metadata such as character count and layout warnings. | `services/resumeParser.ts` |
| 4. Resume structuring | Section detection and extraction of candidate details, education, skills with evidence and evidence strength (HIGH/MEDIUM/LOW), experience, internships, projects, certifications, achievements, links and student signals. | `lib/resumeStructurer.ts` |
| 5. JD structuring | Role, seniority, experience, education, mandatory and preferred skills (original phrase mapped to a canonical skill), responsibilities, tools and domain keywords. | `lib/jdExtractor.ts`, `lib/skillOntology.ts` |
| 6. Matching | Each skill requirement is assigned one of five states (see below); responsibilities are aligned to resume entries. | `lib/matchingEngine.ts` |
| 7. Scoring | Job Fit, ATS Readiness and Resume Quality, plus Interview Readiness. | `lib/scoringEngine.ts`, `lib/atsReadiness.ts`, `lib/resumeQuality.ts`, `lib/projectAnalysis.ts` |
| 8. Point-loss explanation | "What is costing me points": itemised losses per score. | `lib/scoringEngine.ts` |
| 9. Fix My Resume | Rule-based suggestions with confidence, guarded against fabrication. | `lib/fixSuggestions.ts`, `lib/fabricationGuard.ts` |
| 10. Versioning and re-scoring | Applied fixes or manual edits create an immutable version, which is re-scored and compared with the previous one. | `services/analysisService.ts`, `lib/compare.ts` |
| 11. Interview preparation | Questions prioritised HIGH/MEDIUM/LOW, with practice tracking. | `lib/interviewPrep.ts` |
| 12. Application tracking and analytics | Status tracking with timeline; analytics computed from stored records. | `routes/applicationRoutes.ts`, `services/analyticsService.ts` |
| 13. Research module | Comparison of matching methods on a labelled dataset. | `research/experiment.ts` |

The NLP components are described in more detail in [AI Pipeline](ai-pipeline.md), and the data model in [Database](database.md).

## Skill Ontology and Evidence-Graded Matching

A curated ontology of 141 skills maps surface phrases (aliases) to canonical skills, records implied skills, and defines groups of related skills with a similarity value. Each resume skill records where it was found, and its evidence strength is graded HIGH, MEDIUM or LOW.

| Match state | Meaning | Credit |
|-------------|---------|--------|
| STRONG_MATCH | Required skill present with HIGH evidence | 100% |
| MATCH | Required skill present with MEDIUM evidence | 80% |
| PARTIAL_MATCH | Only a related skill is present | at most 50% x similarity |
| WEAK_EVIDENCE | Required skill present with LOW evidence (for example, listed only) | 40% |
| MISSING | No evidence | 0% |

Semantic (related-skill) matches are capped at a partial match and remain reported as gaps. For example, MySQL is never treated as PostgreSQL. The complete rules are given in [Scoring](scoring.md).

## Three Independent Scores

| Score | What it measures |
|-------|------------------|
| **Job Fit** | Fit to the specific job description. Weights, normalised to 100 over applicable categories: mandatory skills 45, preferred skills 15, responsibility alignment 15, project and experience relevance 10, experience level 8, education 7. Experience is not scored when the job description allows freshers or requires 0 years. |
| **ATS Readiness** | An estimate of potential parsing risk (text extractability, structure, headings, contact details and similar checks). It is not the result of any real ATS. Version 2.1.0 added a deduction for malformed extraction, such as run-together words and letter-spaced text. |
| **Resume Quality** | Writing quality: completeness, readability, technical specificity, project quality, internship/experience quality, action verbs, measurable outcomes, consistency and relevance. |
| **Interview Readiness** | A supporting indicator built from technical evidence for mandatory skills, project depth, internship stories, exposure to gap questions, behavioural evidence and the share of generated questions marked as practised. |

Keeping the scores separate lets a candidate distinguish a layout problem from a writing problem from a genuine skills gap.

## Gap Analysis and Explanations

For each requirement the system shows the original job description phrase, the canonical skill, the match state, the credit awarded and the resume evidence used. The "What is costing me points" view lists each loss with its cause; the losses for a score sum exactly to 100 minus that score.

## Fix My Resume

Suggestions are generated by rules, not by a language model. Suggestion types cover weak verbs, keyword alignment, the summary, adding evidence, adding metrics, missing skills, contact details, headings and responsibilities. Each suggestion carries a confidence of high, medium or low.

The fabrication guard compares suggested text with the source resume and flags new skills, new numbers and new named entities. Where a suggestion would need a fact the system does not know, it inserts a placeholder (for example "[add a real metric]"), and the user must explicitly confirm that the resulting claim is true before it is applied.

An optional AI rewording feature (Claude model `claude-opus-5-5`) is available only when an API key is configured on the server. Every AI rewrite passes through the same fabrication guard, and rewrites that introduce skills, numbers or organisations are rejected.

## Versioning and Before/After Comparison

Each upload, applied set of fixes, manual edit or restore creates a new resume version whose content cannot be modified afterwards. The new version is scored by the same engine and compared with its predecessor, and score changes are attributed to the specific changes made. Versions can be exported as DOCX or PDF, and an analysis report can be exported as PDF.

### Verified Example

The following result is covered by a regression test using the sample full-stack job description and sample resume:

| Stage | Job Fit | ATS Readiness | Resume Quality |
|-------|--------:|--------------:|---------------:|
| Original resume | 68.5 (shown as 69) | 99.3 | 83.6 |
| After applying fixes and one user-confirmed real evidence bullet | 73.7 | not reported here | 89.5 |

## Supporting Features

- **Interview preparation:** technical, project, behavioural and design questions derived from the requirements and the resume, prioritised HIGH/MEDIUM/LOW.
- **Application tracker:** statuses Saved, Applied, Online Assessment, Interview, Selected, Rejected and Withdrawn, with a status timeline.
- **Analytics:** application and score statistics computed only from the user's stored records.
- **Accounts and security:** bcrypt password hashing, 15-minute JWT access tokens and rotating httpOnly refresh-token cookies (see [Security](security.md)).

The REST endpoints are listed in [API](api.md).

## Research Evaluation

The ontology engine was compared with keyword, TF-IDF and MiniLM sentence-embedding baselines on a small synthetic dataset of 6 job descriptions and 10 resumes (470 requirement labels, 144 of them positive, and 60 graded relevance labels), labelled by a single annotator.

| Method | Requirement detection F1 |
|--------|-------------------------:|
| Keyword matching | 0.849 |
| TF-IDF (leave-one-job-out cross-validated threshold) | 0.918 |
| MiniLM embeddings (cross-validated threshold) | 0.893 |
| Ontology engine | 0.969 |

For ranking, the ontology Job Fit score achieved MAP 1.000 and nDCG@3 0.969. On the constructed evaluation dataset, the ontology engine achieved the highest observed F1. These results do not establish general superiority; see [Research](research.md) and [Limitations](limitations.md).

## Response to the Drawbacks of Existing Approaches

| Drawback in [existing approaches](existing-system.md) | How the proposed system responds |
|------|------|
| Opaque scores | Weighted components and itemised point losses that sum to the shortfall from 100 |
| Keyword stuffing rewarded | Evidence grading; listed-only skills receive reduced credit |
| Related skills over- or under-credited | Ontology aliases for equivalents; related skills capped at a partial match |
| Fabrication risk in rewriting | Rule-based fixes, fabrication guard, placeholders and user confirmation |
| Non-reproducible results | Deterministic, versioned scoring engine |
| No before/after evidence | Immutable versions re-scored by the same engine, with change attribution |
