# Problem Statement

## Context

Final-year B.Tech students and freshers apply to internships and entry-level roles in large numbers, usually through online portals that screen resumes before a human reads them. Most candidates at this stage have limited professional experience; their strongest evidence lies in academic projects, internships, coursework and certifications. Each job description asks for a different mix of skills, tools and responsibilities, yet many candidates send one generic resume to every opening.

## The Problem

A candidate preparing an application cannot easily answer four practical questions:

1. **How well does my resume fit this particular job?** Not in general, but against the stated mandatory and preferred requirements of one job description.
2. **Why did I get this score?** Which requirements are met, which are missing, and which are mentioned without supporting evidence.
3. **What should I change, and what must I not invent?** Improvements must stay faithful to the candidate's real experience.
4. **Did my changes actually help?** The candidate needs a like-for-like comparison of the resume before and after editing, scored by the same rules.

Commonly available tools answer these questions only partially (see [Existing System](existing-system.md)). Scores are often unexplained, keyword-oriented and non-reproducible; rewriting tools can introduce skills, numbers or organisations the candidate does not have; and edits are rarely tracked as versions that can be re-scored and compared.

## Formal Statement

> Given a job description and a candidate's real resume (PDF or DOCX), design and implement a system that (a) extracts structured information from both documents, (b) matches each job requirement against graded evidence in the resume, (c) computes reproducible, explainable scores in which every lost point is attributed to a specific cause, (d) identifies skill and evidence gaps, (e) suggests fact-preserving improvements that never introduce unconfirmed claims, and (f) re-scores each edited resume version with the same deterministic engine so that the effect of each change can be measured.

## Constraints

- Scores must be deterministic: the same inputs and scoring version must always produce the same result. Any AI component may assist with wording only and must not produce or change a score.
- The system must operate on real uploaded files and handle invalid, corrupted, password-protected and image-only documents safely.
- Claims about the matching method must be supported by an evaluation that is reported conservatively (see [Research](research.md)).

## Target Users

- Final-year undergraduate students preparing for campus and off-campus placements.
- Freshers and recent graduates applying to entry-level technical roles.

Related documents: [Objectives](objectives.md), [Proposed System](proposed-system.md), [Limitations](limitations.md).
