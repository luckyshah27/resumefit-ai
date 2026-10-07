# Limitations

This section records the known limitations of ResumeFit AI as implemented (scoring version 2.1.0). They should be read alongside the results in [Research](research.md) and the design in [Proposed System](proposed-system.md).

## Input and Extraction

| Limitation | Consequence |
|------------|-------------|
| **Rule-based section detection.** Sections are identified from headings and layout cues by rules. | Unusual layouts such as creative templates and multi-column designs can be mis-sectioned, which can move skills or bullets into the wrong section and affect evidence grading. |
| **No OCR.** Scanned or image-only PDFs are rejected rather than processed. | Candidates with scanned resumes must supply a text-based PDF or DOCX. |
| **English only.** The ontology, section headings, verb lists and extraction rules assume English. | Resumes in other languages are not supported. |

## Skill Ontology

- The ontology contains approximately 150 skills, so coverage is incomplete. Skills outside it cannot be matched as canonical skills.
- Two concrete gaps were observed during the research error analysis: **Maven** is missing, and **MySQL does not imply the generic skill "SQL"**. These were deliberately **not** fixed after the test data had been seen, so that the reported results are not tuned to the evaluation set.
- Related-skill similarity values were set by hand.

## Scoring

- **Weights are expert-set, not learned.** The Job Fit, ATS Readiness, Resume Quality and Interview Readiness weights are design decisions. They have not been calibrated against real hiring outcomes, so a higher score does not imply a higher probability of selection.
- **ATS Readiness is an estimate.** It describes potential parsing risks based on general rules. It is not the output of any real applicant tracking system, and real ATS products differ from one another.
- Scores measure the resume against the stated job description only; they cannot account for factors outside the documents, such as referrals, interview performance or employer-specific preferences.

## Research Evaluation

- **Small, synthetic dataset.** The evaluation uses 6 synthetic job descriptions and 10 synthetic resumes (470 requirement labels, 144 positive; 60 graded relevance labels).
- **Single annotator.** All labels were produced by one annotator, the project developer, so inter-annotator agreement could not be measured and annotator bias cannot be ruled out.
- **Possible design-evaluation overlap.** Because the same person designed the ontology and labelled the data, the evaluation may favour the ontology engine.
- **Threshold grid boundary.** In TF-IDF leave-one-job-out cross-validation, the selected threshold was the lowest grid value (0.05) in every fold. This suggests the optimum may lie below the grid, and the grid should be extended lower in future runs; the reported TF-IDF result may therefore understate that baseline.
- Results should be stated only as: "On the constructed evaluation dataset, the ontology engine achieved the highest observed F1." They do not establish general superiority over the baselines.

## AI Component

- AI-assisted rewording requires a server-side API key and is optional. Without a key the feature is unavailable; all scoring, gap analysis and rule-based fixes continue to work.
- When enabled, resume text is sent to an external API for rewording. The fabrication guard checks for new skills, numbers and named entities, but a rule-based guard cannot detect every possible change in meaning, so the user remains responsible for reviewing accepted text.
- The MiniLM embedding model is used only in the research module and does not affect user-facing scores.

## Security and Sessions

- **Access-token lifetime after logout.** Refresh tokens are revoked immediately on logout, but an already-issued JWT access token remains valid until it expires, for up to 15 minutes. See [Security](security.md).
- ClamAV malware scanning is optional and depends on a running ClamAV daemon being configured.

## Scope

- The system is designed for final-year students and freshers applying to entry-level, mainly technical, roles. Its rules (for example, treating projects and internships as primary evidence) are less suitable for senior candidates.
- There is no recruiter-side view; the system is for candidates only.

Possible responses to several of these limitations are listed in [Future Scope](future-scope.md).
