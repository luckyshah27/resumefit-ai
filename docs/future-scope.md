# Future Scope

The items below are **proposed future work**. None of them is implemented in the current version (scoring version 2.1.0). Most respond directly to an entry in [Limitations](limitations.md).

| # | Proposed enhancement | Motivation |
|---|----------------------|------------|
| 1 | OCR for scanned resumes | Scanned and image-only PDFs are currently rejected. |
| 2 | Data-driven ontology expansion using embeddings | The ontology covers about 150 skills and has known gaps. |
| 3 | Calibrating weights against real hiring outcomes, with consent | Current weights are expert-set. |
| 4 | Larger, multi-annotator evaluation dataset with inter-annotator agreement | The current dataset is small, synthetic and single-annotator. |
| 5 | Multilingual support | Only English resumes are supported. |
| 6 | LinkedIn and portfolio import | Evidence is currently taken only from the uploaded resume. |
| 7 | Recruiter-side ranking view | The system currently serves candidates only. |
| 8 | Mobile application | The current client is a web application. |
| 9 | Fine-tuned extraction models evaluated against the deterministic baseline | Rule-based section detection can mis-section unusual layouts. |

## 1. OCR for Scanned Resumes

An OCR stage could be added after validation for files that are currently rejected as image-only. Because OCR output is noisier than native text, the extraction metadata and ATS Readiness checks would need to report OCR confidence, and OCR-derived text should be clearly flagged to the user.

## 2. Data-Driven Ontology Expansion

Sentence embeddings, already used in the research module, could be used to propose candidate aliases and related-skill groups from a corpus of job descriptions. Proposals would be reviewed by a person before being added, and every ontology change would bump the scoring version so that results remain reproducible. Known gaps such as Maven, and the relationship between MySQL and generic "SQL", would be addressed in this way and then re-evaluated on new, unseen test data.

## 3. Calibrating Weights Against Hiring Outcomes

With informed consent, anonymised application outcomes recorded in the application tracker could be used to study whether the score components relate to shortlisting. Any recalibrated weights would be released as a new scoring version, with the earlier version retained for comparison. Such a study would need care to avoid encoding biases present in past hiring decisions.

## 4. Larger, Multi-Annotator Dataset

A larger dataset of real, consented and anonymised resumes and job descriptions, labelled independently by several annotators, would allow inter-annotator agreement (for example Cohen's or Fleiss' kappa) to be reported and would give more reliable comparisons between methods. The TF-IDF threshold grid should also be extended below 0.05, since the lowest value was selected in every cross-validation fold.

## 5. Multilingual Support

This would require language detection, multilingual section headings and verb lists, localised ontology aliases, and a separate evaluation per language.

## 6. LinkedIn and Portfolio Import

Importing structured profile data or repository information (with the user's permission) could provide additional evidence for skills. Evidence from these sources would need to be graded separately from resume evidence, because it is not visible to an employer reading the resume.

## 7. Recruiter-Side Ranking View

The Job Fit score and its per-requirement explanation could support a recruiter view that ranks candidates for one job description. This would raise fairness, transparency and consent questions that would need to be addressed before deployment.

## 8. Mobile Application

A mobile client could reuse the existing REST API (see [API](api.md)) for viewing analyses, practising interview questions and updating application status.

## 9. Fine-Tuned Extraction Models

Learned models for section detection and requirement extraction could improve handling of unusual layouts. They should be evaluated against the current deterministic pipeline as a baseline (see [Research](research.md)). Scores themselves would continue to be computed by the deterministic, versioned engine, so that model outputs are treated as inputs to be checked rather than as scores.
