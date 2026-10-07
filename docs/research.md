# Research: Evaluating Resume–Job Matching Methods

This document describes the experimental part of the project: a comparison of matching methods on a hand-labelled dataset. The code is in `server/src/research/`, the dataset in `server/src/research/dataset/evaluationDataset.json`, and the generated results in [`research/results.json`](../research/results.json). Everything below is computed by the code; no number was entered by hand.

## 1. Problem

The scoring engine must decide, for each requirement in a job description, whether a resume satisfies it, and it must rank candidates sensibly for a job. Two questions follow:

1. **Requirement detection.** How accurately do different methods decide whether a resume satisfies a given JD requirement (for example “Postgres”, “RESTful APIs”, “CI/CD pipelines”)?
2. **Ranking.** If each method's output is turned into a score per (job, resume) pair, how well does it rank the resumes for a job compared with human relevance judgements?

The hard cases are aliases (Postgres = PostgreSQL), paraphrases (“built REST endpoints” = RESTful APIs) and related-but-different technologies (MySQL is not PostgreSQL; React Native is not React; JavaScript is not Java).

## 2. Methods

| Method | Description |
|---|---|
| **A. Keyword matching** | The requirement is present if every non-stopword token of the requirement phrase appears verbatim as a token in the resume |
| **B. TF-IDF similarity** | Unigram and bigram terms over stemmed, stopword-filtered tokens; smoothed IDF and L2 normalisation (similar to scikit-learn defaults); the IDF is fitted on all resume lines and segments, JD texts and resume texts. Score = maximum cosine similarity between the requirement phrase and any resume line or comma-separated segment |
| **C. Semantic embeddings** | `all-MiniLM-L6-v2` sentence embeddings (384 dimensions, mean pooling, L2-normalised) computed locally with transformers.js. Score = maximum cosine similarity between the requirement phrase and any resume unit |
| **Ontology engine** | The application's own matcher: the phrase is mapped to canonical skills through the skill ontology (aliases, case-sensitive ambiguous tokens, implications); present if every canonical skill is in the structured resume. Phrases with no ontology skill fall back to method A |

For ranking, each method produces a score per (job, resume): keyword coverage and the per-requirement TF-IDF and embedding scores are averaged over requirements (mandatory weight 1, preferred 0.5); TF-IDF and embeddings are also tested as whole-document similarity (JD ↔ resume); the ontology method uses the application's full Job Fit score.

## 3. Dataset

| Property | Value |
|---|---|
| Job descriptions | 6 (frontend, Node backend, data analyst, Java backend, ML intern, DevOps intern) |
| Resumes | 10 fresher / early-career profiles |
| Requirements | 47 (6–8 per job, mandatory and preferred) |
| Requirement labels | 470 = every requirement × every resume (144 positive) |
| Relevance labels | 60 = every job × every resume, graded 0 / 1 / 2 |
| Version | 1.0.0 |

All job descriptions and resumes are **synthetic**: written for this project, describing no real person or employer. The dataset is intentionally small.

## 4. Labelling

Labels were written by a **single annotator** (the project developer) following written guidelines stored in the dataset file:

- A requirement is present if the resume genuinely shows it in skills, projects, experience or internships; a skill listed in the skills section counts.
- Synonyms, aliases and paraphrases count (Postgres = PostgreSQL, Go = Golang, K8s = Kubernetes, “containerized the service” = Docker).
- Related-but-different technologies do not count (MySQL ≠ PostgreSQL, JavaScript ≠ Java, React Native ≠ React, Docker ≠ Kubernetes, TensorFlow ≠ PyTorch, Tableau ≠ Power BI, Vitest ≠ Jest).
- For backend “RESTful APIs” the candidate must have built APIs; for the frontend “REST API integration” requirement, consuming APIs is enough.
- A generic “SQL” requirement is satisfied by any SQL dialect.
- Relevance 2 = strong fit, 1 = partial fit, 0 = poor fit, judged as a recruiter would.
- Labels were written before, and independently of, running any method.

Because there is one annotator, inter-annotator agreement could not be measured (section 11).

## 5. Experimental setup

Configuration (stored with every run and in `research/results.json`):

| Setting | Value |
|---|---|
| Methods | keyword, tfidf, embedding, ontology |
| Fixed thresholds (declared before the run) | TF-IDF 0.35, embeddings 0.60 |
| Threshold grid for cross-validation | 0.05 to 0.95 in steps of 0.05 |
| Ranking | nDCG@3 and @5; P@2; relevant = relevance ≥ 2; preferred weight 0.5 |
| Bootstrap | 1,000 resamples, seed 42 |
| Embedding model | Xenova/all-MiniLM-L6-v2, local CPU |
| Scoring engine | 2.1.0 |

## 6. Train / validation / test methodology

No method has learned parameters except the decision threshold of TF-IDF and embeddings. Thresholds are therefore never chosen on the examples they are scored on:

- **Leave-one-job-out cross-validation.** For each of the 6 jobs, the threshold that maximises F1 is chosen on the other 5 jobs (validation) and applied to the held-out job (test). Predictions from the 6 held-out folds are pooled and evaluated.
- **Fixed thresholds** declared in the configuration are reported separately as an untuned reference.
- The **threshold sweep** chart on the Research page is computed on all examples. It is a diagnostic only and is not used to select anything.
- Keyword matching and the ontology engine have no thresholds and are evaluated directly.
- The dataset and the ontology were **not modified after observing results**.

## 7. Metrics

- **Requirement detection:** precision, recall, F1 and accuracy over all 470 (requirement, resume) pairs, also split into mandatory and preferred requirements.
- **Confidence intervals:** 95% percentile bootstrap of F1 over requirement examples (1,000 resamples, seeded for reproducibility).
- **Ranking (per job, averaged over 6 jobs):** nDCG@k with graded gain 2^rel − 1; P@2, MRR and MAP with relevance ≥ 2 counted as relevant. Each job has exactly two strongly relevant resumes, so P@2 is the share of those two that are ranked first and second.

## 8. Results

### 8.1 Requirement detection (470 examples, 144 positive)

| Method | Threshold | Precision | Recall | F1 | 95% CI (F1) | TP / FP / FN / TN |
|---|---|---|---|---|---|---|
| A. Keyword matching | — | 99.1 | 74.3 | 84.9 | 79.8–89.3 | 107 / 1 / 37 / 325 |
| B. TF-IDF, fixed | 0.35 | 99.1 | 73.6 | 84.5 | 79.6–88.7 | 106 / 1 / 38 / 325 |
| B. TF-IDF, cross-validated | 0.05 in every fold | 94.2 | 89.6 | **91.8** | 88.2–95.2 | 129 / 8 / 15 / 318 |
| C. Embeddings, fixed | 0.60 | 96.7 | 81.3 | 88.3 | 84.0–92.0 | 117 / 4 / 27 / 322 |
| C. Embeddings, cross-validated | 0.45–0.55 | 88.4 | 90.3 | **89.3** | 85.4–93.0 | 130 / 17 / 14 / 309 |
| Ontology engine | — | 96.6 | 97.2 | **96.9** | 94.7–98.8 | 140 / 5 / 4 / 321 |

Thresholds chosen per held-out job for embeddings: frontend 0.50, Node backend 0.50, data analyst 0.55, Java backend 0.50, ML intern 0.45, DevOps intern 0.50.

F1 by requirement importance:

| Method | Mandatory F1 | Preferred F1 |
|---|---|---|
| A. Keyword | 84.9 | 84.9 |
| B. TF-IDF (cross-validated) | 92.5 | 90.2 |
| C. Embeddings (cross-validated) | 86.0 | 97.6 |
| Ontology engine | 96.6 | 97.6 |

**On the constructed evaluation dataset, the ontology engine achieved the highest observed F1 (0.969).** Among the general-purpose baselines, TF-IDF with a cross-validated threshold (0.918) was ahead of MiniLM embeddings (0.893), and both improved recall substantially over literal keyword matching (0.849), which had the highest precision.

### 8.2 Ranking (6 jobs × 10 resumes)

| Method | nDCG@3 | nDCG@5 | P@2 | MRR | MAP |
|---|---|---|---|---|---|
| A. Keyword coverage | 0.969 | 0.936 | 0.917 | 0.917 | 0.931 |
| B. TF-IDF (JD ↔ resume) | 0.961 | 0.988 | 0.917 | 1.000 | 0.972 |
| B. TF-IDF (per requirement) | 0.915 | 0.956 | 0.833 | 0.917 | 0.889 |
| C. Embeddings (JD ↔ resume) | 0.910 | 0.939 | 0.750 | 1.000 | 0.917 |
| C. Embeddings (per requirement) | 0.954 | 0.967 | 0.917 | 0.917 | 0.931 |
| ResumeFit Job Fit score | 0.969 | 0.984 | 1.000 | 1.000 | 1.000 |

With only 10 candidates and two strongly relevant resumes per job, ranking metrics saturate quickly; several methods reach MRR 1.000, and differences of one swapped position change P@2 by 0.083.

## 9. Confidence intervals

The 95% intervals are wide because the dataset is small. The ontology interval (94.7–98.8) does not overlap the keyword (79.8–89.3) or fixed-threshold intervals, but it **does** overlap with cross-validated TF-IDF (88.2–95.2) at its upper end, and the TF-IDF and embedding intervals overlap heavily with each other. The data therefore support “the ontology engine performed best on this dataset”, but they do not establish a reliable ordering between TF-IDF and embeddings, and they do not support claims beyond this dataset.

## 10. Error analysis

Misclassified pairs are stored per method in `results.json` (`errors`) and shown on the Research page.

**Ontology engine (5 FP, 4 FN):**
- “REST API integration” / “RESTful APIs”: the ontology maps both to one REST API skill, so it cannot tell building APIs from consuming them. This caused 5 false positives against the context rule in the labelling guidelines.
- “JWT authentication”: the phrase maps to two skills (JWT and authentication) and requires both; two resumes that show JWT without the separate word “authentication” were missed.
- Generic “SQL”: a specific SQL database (PostgreSQL, MySQL) does not imply the generic skill “SQL” in the ontology, giving 2 misses.
- “Maven” is not in the ontology. It caused no error only because phrases outside the ontology fall back to keyword matching.

**Keyword matching (1 FP, 37 FN):** almost all errors are aliases and paraphrases (“Node” for Node.js, “Mongo”, “Postgres” for PostgreSQL, “REST endpoints” for RESTful APIs, “Excel” for Microsoft Excel). Its one false positive is React matched inside a React Native resume.

**TF-IDF:** the cross-validated threshold was the **lowest value of the grid (0.05) in every fold**, meaning almost any term overlap counts as a match. The grid should extend lower in future work. TF-IDF also has no notion of aliases (zero similarity for Postgres vs PostgreSQL) and produced false positives from shared words such as “API”.

**Embeddings:** the main weakness is related-technology confusion, the case the scoring engine is designed to avoid. Three resumes that use PostgreSQL but not MySQL were matched to the Java job's MySQL requirement (three false positives), and PyTorch and scikit-learn requirements matched resumes with other ML tools. Embeddings also missed some RESTful-API paraphrases at the chosen thresholds.

These findings motivate the engine design: aliases and implications are handled explicitly, and related technologies are allowed only as capped partial matches (see [scoring](scoring.md)).

## 11. Limitations

- **Small and synthetic:** 6 jobs, 10 resumes, 470 requirement labels. Results describe relative behaviour of the methods on this data, not production accuracy.
- **Single annotator:** no inter-annotator agreement; the annotator's judgement defines the ground truth.
- **Same author for ontology and dataset:** the ontology was written before the dataset, but by the same person, so the ontology may be biased toward the vocabulary the annotator uses. This favours the ontology method and is the main threat to validity.
- **Ranking with 10 candidates** saturates quickly and is sensitive to single swaps.
- **One embedding model** (MiniLM) was tested; larger or domain-tuned models may behave differently.
- **TF-IDF** was fitted on the evaluation corpus itself (unsupervised; no labels used).

## 12. Future work

- Collect a larger dataset with several annotators and report Cohen's kappa.
- Hold out a test set written by someone other than the ontology author.
- Extend the TF-IDF threshold grid below 0.05 and evaluate larger embedding models.
- Evaluate a hybrid method: ontology first, embeddings only to *suggest* new aliases for human review.
- Add context-aware rules for building versus consuming REST APIs, and a generic “SQL” implication — then re-evaluate on **new** data rather than this test set.

## Reproducing the results

```bash
npm install
npm run research        # writes research/results.json (about 5 s after the first model download)
```

The in-app **Research** page runs the same experiment, stores the configuration and results in MongoDB, and shows the tables, charts and error analysis. The unit tests in `server/src/research/research.test.ts` check the metric implementations and run the experiment with a deterministic stand-in embedder so that they work offline.
