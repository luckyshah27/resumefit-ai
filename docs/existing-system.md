# Existing System

This section describes the approaches that students and freshers typically rely on today to evaluate and improve a resume for a job application. It is a general characterisation of categories of tools, not an assessment of any specific commercial product.

## 1. Manual Review

Candidates ask peers, seniors, faculty or placement cells to review their resume, or compare it against the job description by eye.

**Drawbacks**

- Feedback is subjective and varies between reviewers.
- It does not scale to tailoring a resume for many different job descriptions.
- There is no consistent measure of whether a revision improved the fit.

## 2. Generic ATS Keyword Checkers

Online checkers accept a resume and a job description and return a single "match" or "ATS" percentage, usually based on keyword overlap between the two texts.

**Drawbacks**

- **Opaque scores.** A single number is reported with little or no account of how it was computed, which requirements were counted, or how much each one contributed.
- **Keyword stuffing is rewarded.** Because a mention in a skills list counts the same as demonstrated use in a project, candidates are encouraged to list terms rather than show evidence.
- **No evidence grading.** A skill named once in a list is treated the same as a skill backed by several project and internship bullets.
- **Synonyms and related skills are handled poorly.** Pure string matching misses equivalent phrasings (for example "React.js" and "React"), while loose similarity can over-credit a related but different technology (for example treating MySQL experience as PostgreSQL experience).
- **Mandatory and preferred requirements are often not distinguished.**
- **Parsing risk and content quality are mixed into one number**, so a candidate cannot tell whether a low score is caused by layout, by weak writing, or by a genuine skills gap.

## 3. Resume Builders and Templates

Template-based builders help candidates produce a well-formatted document and sometimes include generic tips.

**Drawbacks**

- Guidance is generic rather than specific to one job description.
- Visually rich templates (multi-column layouts, tables, graphics) can themselves increase the risk that automated parsers extract text incorrectly.
- They do not measure the fit between the resume and a target role.

## 4. Chat-Based LLM Rewriting

Candidates paste their resume and a job description into a general-purpose large language model chat and ask it to "optimise" or "tailor" the resume.

**Drawbacks**

- **Fabrication risk.** A language model can add technologies, metrics, organisations or responsibilities that the candidate never stated. Submitting such claims is misleading and is likely to be exposed in an interview.
- **Non-deterministic, unexplained judgments.** Asking a model to "score" a resume can give different answers for the same input, and the reasoning cannot be audited against fixed rules.
- **No guardrails.** There is usually no automated check that the rewritten text is supported by the original.
- **No version history.** Edits are not stored as versions, so there is no reliable before/after comparison.
- **Privacy.** The full resume is sent to an external service, often without the candidate considering its retention policies.

## Summary of Gaps

| Capability | Manual review | Keyword checkers | Resume builders | LLM chat rewriting |
|------------|:-------------:|:----------------:|:---------------:|:------------------:|
| Job-specific evaluation | Partial | Yes | No | Partial |
| Transparent, itemised score | No | Rarely | No | No |
| Reproducible (deterministic) score | No | Usually | No | No |
| Evidence-graded skill matching | Partial | No | No | No |
| Distinguishes a related skill from the required skill | Partial | Rarely | No | Inconsistent |
| Separates parsing risk, content quality and job fit | No | Rarely | No | No |
| Protection against fabricated claims | Depends on reviewer | Not applicable | Not applicable | Usually none |
| Versioned before/after re-scoring | No | No | No | No |

These gaps motivate the design described in [Proposed System](proposed-system.md).
