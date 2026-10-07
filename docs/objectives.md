# Objectives

The objectives below follow from the [Problem Statement](problem-statement.md). Each is mapped to the part of the implementation that addresses it.

## Primary Objectives

| # | Objective | Where it is addressed |
|---|-----------|-----------------------|
| O1 | Accept real PDF and DOCX resumes safely, rejecting invalid, oversized (above 5 MB), corrupted, password-protected and image-only files, with an optional ClamAV malware scan. | `server/src/services/resumeParser.ts`, `server/src/services/fileScanner.ts` ([Security](security.md)) |
| O2 | Convert a resume into a structured representation: candidate details, education, skills with evidence and evidence strength (HIGH/MEDIUM/LOW), experience, internships, projects, certifications, achievements, links and student signals. | `server/src/lib/resumeStructurer.ts` |
| O3 | Convert a job description into a structured representation: role, seniority, experience, education, mandatory and preferred skills (original phrase mapped to a canonical skill), responsibilities, tools and domain keywords. | `server/src/lib/jdExtractor.ts`, `server/src/lib/skillOntology.ts` |
| O4 | Match each requirement to resume evidence using five explicit states (STRONG_MATCH, MATCH, PARTIAL_MATCH, WEAK_EVIDENCE, MISSING), without treating a related skill as equivalent to the required one. | `server/src/lib/matchingEngine.ts` ([Scoring](scoring.md)) |
| O5 | Compute three independent, deterministic and versioned scores (Job Fit, ATS Readiness, Resume Quality), plus an Interview Readiness indicator, with every lost point attributed to a cause. | `server/src/lib/scoringEngine.ts`, `atsReadiness.ts`, `resumeQuality.ts`, `interviewPrep.ts` |
| O6 | Provide fact-preserving improvement suggestions, guarded against fabrication, that require placeholders and explicit user confirmation for any new claim. | `server/src/lib/fixSuggestions.ts`, `server/src/lib/fabricationGuard.ts` |
| O7 | Store every edit as an immutable resume version, re-score it with the same engine, and show a before/after comparison with change attribution. | `server/src/services/analysisService.ts`, `server/src/lib/compare.ts` |
| O8 | Evaluate the matching approach against keyword, TF-IDF and sentence-embedding baselines on a labelled dataset and report results conservatively. | `server/src/research/experiment.ts` ([Research](research.md)) |

## Secondary Objectives

| # | Objective | Where it is addressed |
|---|-----------|-----------------------|
| S1 | Generate interview preparation questions prioritised HIGH/MEDIUM/LOW from the job requirements and resume evidence, with practice tracking. | `server/src/lib/interviewPrep.ts`, `client/src/pages/InterviewPage.tsx` |
| S2 | Track job applications through the statuses Saved, Applied, Online Assessment, Interview, Selected, Rejected and Withdrawn, with a status timeline. | `server/src/routes/applicationRoutes.ts`, `client/src/pages/ApplicationsPage.tsx` |
| S3 | Provide personal analytics computed only from stored records. | `server/src/services/analyticsService.ts`, `client/src/pages/DashboardPage.tsx` |
| S4 | Export resume versions as DOCX or PDF, and the analysis report as PDF. | `server/src/services/exportService.ts` |
| S5 | Secure user accounts with bcrypt password hashing, short-lived JWT access tokens (15 minutes) and rotating httpOnly refresh-token cookies. | `server/src/services/tokenService.ts` ([Security](security.md)) |
| S6 | Optionally offer AI-assisted rewording of bullets, used only when an API key is configured, with every output checked by the fabrication guard and with no influence on scores. | `server/src/services/aiRewriter.ts` ([AI Pipeline](ai-pipeline.md)) |

## Non-Objectives

The following are deliberately out of scope for this version: predicting hiring outcomes, reproducing the behaviour of any specific commercial applicant tracking system, OCR of scanned resumes, and non-English resumes. See [Limitations](limitations.md) and [Future Scope](future-scope.md).
