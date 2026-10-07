# AI / NLP Pipeline

ResumeFit AI's “AI” is mostly a **deterministic natural-language-processing pipeline**: rules, a curated skill ontology and statistical text processing that turn two unstructured documents into structured, comparable data. A language model is used in exactly one optional place (rewording weak bullets), behind a fact check, and never for scoring.

| Stage | Deterministic? | Code |
|---|---|---|
| File validation and text extraction | Yes | `services/resumeParser.ts` |
| Resume structuring and evidence grading | Yes | `lib/resumeStructurer.ts` |
| Skill recognition and normalisation | Yes | `lib/skillOntology.ts` |
| Job description extraction | Yes | `lib/jdExtractor.ts` |
| Matching and scoring | Yes | `lib/matchingEngine.ts`, `atsReadiness.ts`, `resumeQuality.ts`, `projectAnalysis.ts` |
| Fix suggestions and fabrication guard | Yes | `lib/fixSuggestions.ts`, `lib/fabricationGuard.ts` |
| Interview question generation | Yes | `lib/interviewPrep.ts` |
| Optional rewording (Claude) | No (language model) | `services/aiRewriter.ts` |
| Research baselines (TF-IDF, MiniLM embeddings) | TF-IDF yes; embeddings are a fixed pretrained model | `research/tfidf.ts`, `research/embeddings.ts` |

## 1. Text extraction

- **PDF:** `pdf-parse` (pdf.js) extracts text page by page. Layout signals are collected for ATS Readiness: page count, characters per page, tables (vector-drawing detection), embedded images, and a multi-column heuristic (more than 25% of lines contain a wide internal gap).
- **DOCX:** `mammoth` converts the document to HTML, which is turned into text with list items preserved as `- ` bullets. Raw-text extraction would drop Word's bullet markers, so entries and their bullets could no longer be separated. Tables and images are counted from the HTML.
- **Normalisation:** line endings, non-breaking and zero-width spaces, tabs and blank-line runs are normalised; a share of unusual glyphs (icon fonts, replacement characters) is measured.
- Files under 50 extractable characters are rejected as image-only; OCR is not attempted.

## 2. Resume structuring

1. **Section detection.** Lines are classified as headings using a synonym table (“Work Experience”, “Academic Projects”, “Technical Skills”, “Positions of Responsibility”…). Inline headings (“Skills: Java, Python”) are supported, and sub-labels inside a Skills block (“Languages: …”) do not start new sections. ALL-CAPS short lines that are not known headings are kept as non-standard sections, which ATS Readiness flags. The first non-empty line is never a heading (it is normally the candidate's name).
2. **Entry splitting.** Experience, internship and project sections are split into entries: title lines (dates, separators, short title-like lines) start an entry; bullets attach to it; a non-bullet line that continues a sentence is joined to the previous bullet, which **repairs PDF line wrapping**. Titles, organisations, date ranges and durations are parsed. Roles containing “intern”, “trainee” or “apprentice” are classified as internships.
3. **Candidate details:** name, email, phone, location and profile links (LinkedIn, GitHub, LeetCode, portfolio).
4. **Education:** degree level (school, diploma, bachelor, master, doctorate), degree, field, institution, year and CGPA/percentage.
5. **Student signals:** final-year projects (by heading or wording such as “capstone” or “major project”), hackathons, competitive programming, open-source contributions, coursework, certification count, GitHub link and graduation year.

## 3. Skill ontology and evidence

`skillOntology.ts` defines 141 canonical skills in 13 categories (languages, frontend, backend, databases, cloud, DevOps, data, ML, mobile, testing, tools, concepts, soft skills).

- **Aliases** map surface forms to one skill: “Postgres”, “PSQL” → PostgreSQL; “GoLang”, “Golang” → Go; “RESTful APIs”, “REST endpoints” → REST API; “K8s” → Kubernetes; “sklearn” → scikit-learn.
- **Ambiguity guards:** short tokens such as “Go”, “R”, “C”, “REST”, “Node” and “Spring” are matched case-sensitively with negative look-aheads (“Go to market”, “rest of the team”, “Spring 2025”). Longer aliases win overlapping spans (“React Native” beats “React”, “Spring Boot” beats “Spring”, “JavaScript” never matches “Java”).
- **Implications:** using a skill implies others (Next.js → React → JavaScript; Express → Node.js; pandas → Python; AWS → cloud computing).
- **Related groups** (relational databases, cloud platforms, deep-learning frameworks, …) each carry a similarity. They are used **only** to award a capped partial match; a related skill never counts as the required one.
- **Evidence:** every mention is recorded with its text and source section. Profile URLs (github.com/…) are not counted as skill claims. Each skill is graded HIGH / MEDIUM / LOW (see [scoring](scoring.md#2-evidence-strength)).

## 4. Job description extraction

- Lines are assigned a context from JD headings: responsibilities, requirements (mandatory), nice-to-have (preferred), about, benefits (ignored).
- Each skill mention becomes a requirement with its **original phrase** (all phrasings are kept), canonical skill, importance and category. Cue words override the section: “a plus”, “preferred”, “familiarity with” → preferred; “must”, “required”, “strong”, “hands-on” → mandatory. A skill mentioned as both becomes mandatory.
- Role and company come from a labelled line, the title line or “hiring/seeking a …” patterns; seniority from role words or experience; years from ranges (“0–2 years”), minimums (“3+ years”) or “freshers welcome”; education from degree mentions.
- Responsibilities are the bullet lines of the responsibilities section (or verb-led sentences when there is no such section), each with stemmed keywords and the skills it names.

## 5. Matching

Requirement matching, responsibility matching and all scores are described in [scoring](scoring.md). Responsibility matching uses a small suffix-stripping stemmer and keyword coverage over resume bullets, combined with skill coverage; it is lexical, not semantic, by design (predictable and explainable).

## 6. Fix suggestions and the fabrication guard

Suggestions are generated by rules from the analysis: weak opening phrases (“Responsible for developing…” → “Developed…”), the JD's exact wording for a skill already listed, a targeted summary built only from evidenced skills, templates asking for real evidence or real metrics, missing-skill additions, profile links, heading renames and uncovered responsibilities.

The **fabrication guard** (`fabricationGuard.ts`) compares suggested text with the current resume and reports:

- **new skills:** canonical skills not present (or implied) in the resume;
- **new numbers:** numbers that do not appear in the resume;
- **new entities:** capitalised names (companies, products, institutions) not found in the resume, apart from the target role title.

`[placeholders]` are instructions to the user, so they are ignored by the guard but block saving until replaced. The server re-checks every applied fix: anything that adds a claim must be confirmed by the user, and manual edits that introduce new skills, numbers or names also require confirmation (`CONFIRMATION_REQUIRED`).

## 7. Optional AI rewording

When `ANTHROPIC_API_KEY` is set on the server, “AI wording” sends up to eight weak bullets, the resume text and the target role to Claude (`claude-opus-5-5`, structured JSON output, low effort). The system prompt forbids new technologies, companies, numbers, outcomes and responsibilities.

- Every returned rewrite is checked by the same fabrication guard; only rewrites with no violations are offered, marked “passed fact check”.
- The user still chooses to apply them, and the server guard runs again on apply.
- Refusals, malformed output or provider errors return no suggestions (`502 AI_UNAVAILABLE` for errors); the deterministic suggestions remain available.
- Limited to 10 requests per hour per user. The key never leaves the server.
- **The model never produces, changes or influences a score.** Its text only becomes part of a resume version, which the deterministic engine then scores.

## 8. Interview preparation

Questions are generated from templates and a per-skill question bank, grounded in the analysis: technical questions for mandatory and preferred requirements (with tips pointing to the project where the skill was used), project and internship questions naming the candidate's own entries, role-specific questions from JD responsibilities, gap questions for missing or transferable requirements, standard behavioural questions, and system-design questions when the role is backend, full-stack or more senior. Each question gets a priority from the requirement's match state (see [scoring](scoring.md#82-interview-readiness)).

## 9. Research-only components

TF-IDF and the MiniLM sentence-embedding model (`all-MiniLM-L6-v2`, run locally with transformers.js) are used only in the research module to compare methods (see [research](research.md)). They are not used in the production scoring path, which keeps scores deterministic, fast and explainable.
