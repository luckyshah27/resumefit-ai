import { getSkill, skillName } from './skillOntology.js';
import type { JobFitResult } from './matchingEngine.js';
import type { EntryAnalysis } from './projectAnalysis.js';
import type { ScoreComponent, StructuredJob, StructuredResume } from './types.js';
import { round1 } from '../utils/text.js';

export type InterviewQuestion = {
  id: string;
  category: 'technical' | 'project' | 'behavioral' | 'role' | 'system-design' | 'gap';
  question: string;
  why: string;
  relatedRequirement: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  tips: string[];
  priority: Priority;
};

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export type PrepTopic = { topic: string; priority: Priority; reason: string; importance: 'MANDATORY' | 'PREFERRED'; state: string };

export type InterviewPrep = {
  readiness: number;
  evidenceReadiness: number;
  components: ScoreComponent[];
  questions: InterviewQuestion[];
  focusAreas: string[];
  /** What to study first, derived from requirement match states. */
  prepPlan: PrepTopic[];
};

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** HIGH = mandatory gap; MEDIUM = mandatory without depth or preferred gap; LOW = already strong. */
export const requirementPriority = (importance: 'MANDATORY' | 'PREFERRED', state: string): Priority => {
  const gap = state === 'MISSING' || state === 'PARTIAL_MATCH' || state === 'WEAK_EVIDENCE';
  if (importance === 'MANDATORY') return gap ? 'HIGH' : state === 'MATCH' ? 'MEDIUM' : 'LOW';
  return gap ? 'MEDIUM' : 'LOW';
};

const STATE_REASON: Record<string, string> = {
  MISSING: 'not on your resume',
  PARTIAL_MATCH: 'only a related skill on your resume',
  WEAK_EVIDENCE: 'listed but not demonstrated',
  MATCH: 'used, but not shown in depth',
  STRONG_MATCH: 'strongly evidenced — expect deep follow-ups',
};

const SKILL_QUESTIONS: Record<string, string[]> = {
  javascript: ['Explain closures and give a practical use case from your code.', 'How does the event loop handle promises versus setTimeout callbacks?'],
  typescript: ['When would you use a union type versus an interface with optional fields?', 'How do generics help you type a reusable API client?'],
  react: ['How do you decide between local state, context and a store such as Redux?', 'What causes unnecessary re-renders and how have you prevented them?'],
  nodejs: ['How does Node.js handle many concurrent requests on a single thread?', 'How would you structure error handling in an Express/Node API?'],
  express: ['Walk through how middleware ordering affects authentication and error handling in Express.', 'How would you validate request bodies in an Express route?'],
  'rest-api': ['How do you design resource URLs, status codes and pagination for a REST API?', 'What makes an API endpoint idempotent, and why does it matter?'],
  postgresql: ['How would you find and fix a slow PostgreSQL query?', 'When would you add an index, and what does it cost?'],
  mysql: ['Explain the difference between INNER JOIN and LEFT JOIN with an example.', 'How do transactions and isolation levels prevent inconsistent data?'],
  sql: ['Write a query to find the second highest salary per department.', 'What is the difference between WHERE and HAVING?'],
  mongodb: ['How do you model one-to-many relationships in MongoDB: embed or reference?', 'How do indexes work in MongoDB and how did you use them?'],
  python: ['What is the difference between a list, tuple and generator — when do you use each?', 'How do you manage dependencies and virtual environments in a Python project?'],
  java: ['Explain the difference between an interface and an abstract class in Java.', 'How does garbage collection work in the JVM at a high level?'],
  'spring-boot': ['How does dependency injection work in Spring Boot?', 'How would you structure controllers, services and repositories in a Spring Boot app?'],
  go: ['How do goroutines and channels differ from threads and locks?', 'How do you handle errors idiomatically in Go?'],
  docker: ['What is the difference between an image and a container?', 'How would you make a Docker image smaller and faster to build?'],
  kubernetes: ['What problem do Kubernetes Deployments and Services solve?', 'How would you roll back a bad deployment?'],
  aws: ['Which AWS services would you use to host a small web app and why?', 'How do IAM roles differ from IAM users?'],
  git: ['How do you resolve a merge conflict, and how do you avoid them?', 'Explain rebase versus merge and when you prefer each.'],
  'unit-testing': ['What do you unit-test versus integration-test?', 'How do you test code that calls an external API?'],
  jest: ['How do you mock a module in Jest?', 'How do you test asynchronous code with Jest?'],
  'machine-learning': ['How do you detect and handle overfitting?', 'How do you choose an evaluation metric for an imbalanced dataset?'],
  'scikit-learn': ['Walk through a scikit-learn pipeline you built: preprocessing, model, evaluation.', 'How does cross-validation work and why use it?'],
  pytorch: ['Explain what happens in one PyTorch training step.', 'How do you move training to a GPU and handle batches?'],
  tensorflow: ['How do you prevent overfitting in a Keras/TensorFlow model?', 'What is the difference between eager execution and graph mode?'],
  pandas: ['How do you handle missing values in a pandas DataFrame?', 'Explain groupby with an example from your analysis.'],
  'power-bi': ['How did you model data for a Power BI dashboard?', 'What is a DAX measure versus a calculated column?'],
  'data-analysis': ['Walk through how you would analyse a sudden drop in a business metric.', 'How do you validate that your data is clean before analysis?'],
  dsa: ['Explain the time complexity of your favourite sorting algorithm and when it degrades.', 'How would you detect a cycle in a linked list?'],
  oop: ['Explain the four OOP principles with examples from your projects.', 'What is the difference between composition and inheritance?'],
  'system-design': ['How would you design a rate limiter?', 'Explain the trade-offs between vertical and horizontal scaling.'],
  graphql: ['How does GraphQL differ from REST, and what problems does it introduce?'],
  redis: ['When would you use Redis as a cache and how do you invalidate it?'],
  cicd: ['Describe a CI/CD pipeline you would set up for a web app.'],
  authentication: ['How does JWT authentication work and where should tokens be stored?'],
  jwt: ['How does JWT authentication work and where should tokens be stored on the client?'],
  agile: ['How do you break a feature into tasks for a sprint?'],
};

const CATEGORY_FALLBACK: Record<string, string> = {
  language: 'What are the strengths and weaknesses of {skill}, and why did you use it?',
  frontend: 'How would you structure a medium-sized UI built with {skill}?',
  backend: 'How do you handle validation, errors and authentication in {skill}?',
  database: 'How would you design the schema and indexes for a feature using {skill}?',
  cloud: 'Which {skill} services would you use to deploy and monitor a web application?',
  devops: 'How have you used {skill} and what problem did it solve?',
  data: 'Walk through an analysis you performed with {skill}.',
  ml: 'Describe a model you built with {skill}: data, training, evaluation.',
  mobile: 'How do you manage state and offline behaviour in a {skill} app?',
  testing: 'How would you set up {skill} tests for an existing codebase?',
  tool: 'How do you use {skill} in a team workflow?',
  concept: 'Explain {skill} and describe where you applied it.',
  soft: 'Tell me about a time you demonstrated {skill}.',
};

const DESIGN_PROMPTS: Array<{ pattern: RegExp; prompt: string }> = [
  { pattern: /fintech|payment|banking/i, prompt: 'Design a payments dashboard that shows transactions in near real time for thousands of merchants.' },
  { pattern: /e-?commerce|retail|marketplace/i, prompt: 'Design the product catalogue and search service for an e-commerce site.' },
  { pattern: /health/i, prompt: 'Design an appointment-booking system that prevents double booking.' },
  { pattern: /edtech|learning|education/i, prompt: 'Design an online quiz platform that handles thousands of simultaneous submissions.' },
  { pattern: /analytics|data|dashboard/i, prompt: 'Design a pipeline that ingests event data and powers a daily metrics dashboard.' },
  { pattern: /social|chat|real-time/i, prompt: 'Design a real-time chat feature with message history.' },
];

const BEHAVIORAL = [
  { key: 'teamwork', q: 'Tell me about a time you worked in a team and disagreed on an approach. What happened?' },
  { key: 'problem-solving', q: 'Describe the hardest bug you have fixed. How did you find the root cause?' },
  { key: 'learning', q: 'Tell me about a time you had to learn a new technology quickly to deliver something.' },
  { key: 'ownership', q: 'Describe a project where you took ownership beyond what was asked.' },
  { key: 'failure', q: 'Tell me about something that did not go as planned. What did you change afterwards?' },
];

const statusOf = (ratio: number): ScoreComponent['status'] => (ratio >= 0.75 ? 'pass' : ratio >= 0.45 ? 'warn' : 'fail');

export const PRACTICE_WEIGHT = 15;

export const buildInterviewPrep = (
  job: StructuredJob,
  resume: StructuredResume,
  jobFit: JobFitResult,
  analyses: { projects: EntryAnalysis[]; internships: EntryAnalysis[] },
  practicedIds: string[] = [],
): InterviewPrep => {
  const questions: Array<Omit<InterviewQuestion, 'id' | 'priority'>> = [];
  const mandatory = jobFit.requirementMatches.filter((m) => m.importance === 'MANDATORY' && m.category !== 'soft');
  const preferred = jobFit.requirementMatches.filter((m) => m.importance === 'PREFERRED' && m.category !== 'soft');

  // Technical: mandatory first, then preferred skills the candidate claims.
  for (const match of [...mandatory, ...preferred.filter((m) => m.exactMatch)].slice(0, 9)) {
    const bank = SKILL_QUESTIONS[match.canonical];
    const def = getSkill(match.canonical);
    const question = bank?.[0] ?? CATEGORY_FALLBACK[def?.category ?? 'concept'].replace('{skill}', match.requirement);
    const evidenceEntry = match.evidence.find((item) => item.entryTitle)?.entryTitle;
    questions.push({
      category: 'technical',
      question,
      why: `${match.importance === 'MANDATORY' ? 'Mandatory' : 'Preferred'} requirement “${match.originalPhrase}” (${match.finalMatchState.replace('_', ' ').toLowerCase()}).`,
      relatedRequirement: match.requirement,
      difficulty: match.importance === 'MANDATORY' ? 'medium' : 'easy',
      tips: [
        evidenceEntry ? `Anchor your answer in “${evidenceEntry}”, where you used ${match.requirement}.` : `You have little resume evidence for ${match.requirement}; prepare a concrete example.`,
        'Explain the concept first, then a trade-off, then your own example.',
      ],
    });
    if (bank?.[1] && match.finalMatchState === 'STRONG_MATCH') {
      questions.push({ category: 'technical', question: bank[1], why: `Follow-up depth check on ${match.requirement}, which your resume shows strongly.`, relatedRequirement: match.requirement, difficulty: 'hard', tips: ['Interviewers probe strong claims more deeply. Expect a follow-up question.'] });
    }
  }

  // Project questions from the most relevant projects.
  const topProjects = [...analyses.projects].sort((a, b) => b.overall - a.overall).slice(0, 2);
  for (const project of topProjects) {
    const tech = project.relevantTechnologies[0] ?? project.technologies[0];
    questions.push({ category: 'project', question: `Walk me through the architecture of “${project.title}”. What are the main components and how do they communicate?`, why: 'Your top-scoring project; interviewers usually start here.', relatedRequirement: null, difficulty: 'medium', tips: ['Draw the data flow: client → API → database.', 'Mention one design decision you would change now.'] });
    if (tech) questions.push({ category: 'project', question: `Why did you choose ${tech} for “${project.title}”? What alternatives did you consider?`, why: `${tech} is relevant to this JD.`, relatedRequirement: tech, difficulty: 'medium', tips: ['Give at least one alternative and a trade-off.'] });
    questions.push({ category: 'project', question: `What was the hardest problem in “${project.title}” and how did you solve it?`, why: 'Tests depth and ownership of the project.', relatedRequirement: null, difficulty: 'medium', tips: ['Use the STAR structure: Situation, Task, Action, Result.'] });
    if (project.dimensions.find((d) => d.id === 'outcome')?.score === 0) {
      questions.push({ category: 'project', question: `How did you measure whether “${project.title}” worked well?`, why: 'The project has no measurable outcome on the resume, so expect to be asked.', relatedRequirement: null, difficulty: 'easy', tips: ['Prepare a real number (users, latency, accuracy), or explain how you would measure it.'] });
    }
  }

  // Internship questions.
  for (const internship of analyses.internships.slice(0, 2)) {
    questions.push({ category: 'project', question: `What was your role at ${internship.organization ?? internship.title}, and what did you personally deliver?`, why: 'Internship experience is the strongest signal for fresher roles.', relatedRequirement: null, difficulty: 'easy', tips: ['Separate “we” from “I”. Name what you owned.'] });
  }

  // Role-specific from responsibilities.
  for (const responsibility of jobFit.responsibilityMatches.slice(0, 4)) {
    questions.push({
      category: 'role',
      question: `This role involves: “${responsibility.responsibility}”. Describe how you have done something similar, or how you would approach it.`,
      why: `JD responsibility (${responsibility.finalMatchState.replace('_', ' ').toLowerCase()} on your resume).`,
      relatedRequirement: responsibility.responsibility,
      difficulty: 'medium',
      tips: responsibility.bestEvidence ? [`Closest evidence on your resume: “${responsibility.bestEvidence.slice(0, 90)}”.`] : ['No direct evidence on the resume. Prepare an example from coursework or a project.'],
    });
  }

  // Gap questions.
  for (const gap of jobFit.requirementMatches.filter((m) => m.importance === 'MANDATORY' && (m.finalMatchState === 'MISSING' || m.finalMatchState === 'PARTIAL_MATCH')).slice(0, 4)) {
    questions.push({
      category: 'gap',
      question: `The role requires ${gap.requirement}. What is your experience with it, and how would you get productive quickly?`,
      why: `${gap.requirement} is ${gap.finalMatchState === 'MISSING' ? 'missing' : `only a transferable match via ${gap.semanticMatch?.relatedSkillName}`} on your resume.`,
      relatedRequirement: gap.requirement,
      difficulty: 'medium',
      tips: gap.semanticMatch
        ? [`Bridge from ${gap.semanticMatch.relatedSkillName}: explain what transfers and what is different.`, 'Mention a concrete learning plan, such as a small project this week.']
        : ['Be honest about the gap. Describe a specific learning plan and any related experience.'],
    });
  }

  // Behavioural.
  const softIds = new Set(resume.skills.filter((skill) => skill.category === 'soft').map((skill) => skill.id));
  for (const item of BEHAVIORAL) {
    questions.push({
      category: 'behavioral',
      question: item.q,
      why: softIds.has(item.key) ? `Your resume signals ${skillName(item.key).toLowerCase()}; expect to back it with a story.` : 'Standard behavioural question for fresher roles.',
      relatedRequirement: null,
      difficulty: 'easy',
      tips: ['Use STAR. Keep it under 2 minutes and end with what you learned.'],
    });
  }

  // System design when relevant.
  const designRelevant =
    jobFit.requirementMatches.some((m) => ['system-design', 'microservices', 'caching', 'redis', 'kafka'].includes(m.canonical)) ||
    ['MID', 'SENIOR', 'LEAD'].includes(job.seniority) ||
    /backend|full[- ]?stack|platform|sde|software engineer/i.test(job.role);
  if (designRelevant) {
    const context = `${job.role} ${job.domainKeywords.join(' ')}`;
    const prompt = DESIGN_PROMPTS.find((item) => item.pattern.test(context))?.prompt ?? 'Design a URL shortener that handles millions of redirects per day.';
    questions.push({ category: 'system-design', question: prompt, why: 'The role includes backend/system responsibilities.', relatedRequirement: 'System design', difficulty: 'hard', tips: ['Clarify requirements and scale first.', 'Cover API, data model, storage, caching and failure handling.'] });
    questions.push({ category: 'system-design', question: 'How would you add caching to one of your projects, and how would you keep it consistent?', why: 'Connects system design to your own work.', relatedRequirement: 'Caching', difficulty: 'hard', tips: ['Discuss cache-aside, TTLs and invalidation.'] });
  }

  const requirementByName = new Map(jobFit.requirementMatches.map((match) => [match.requirement, match]));
  const responsibilityByText = new Map(jobFit.responsibilityMatches.map((match) => [match.responsibility, match]));
  const priorityOf = (question: Omit<InterviewQuestion, 'id' | 'priority'>): Priority => {
    const requirement = question.relatedRequirement ? requirementByName.get(question.relatedRequirement) : undefined;
    if (requirement) return requirementPriority(requirement.importance, requirement.finalMatchState);
    const responsibility = question.relatedRequirement ? responsibilityByText.get(question.relatedRequirement) : undefined;
    if (responsibility) return responsibility.finalMatchState === 'MISSING' || responsibility.finalMatchState === 'WEAK_EVIDENCE' ? 'HIGH' : responsibility.finalMatchState === 'PARTIAL_MATCH' ? 'MEDIUM' : 'LOW';
    if (question.category === 'gap') return 'HIGH';
    if (question.category === 'project' || question.category === 'system-design') return 'MEDIUM';
    return 'LOW';
  };
  // Stable order: questions are grouped by priority but keep generation order inside each group.
  const finalQuestions: InterviewQuestion[] = questions
    .map((question, index) => ({ ...question, id: `q-${index + 1}`, priority: priorityOf(question) }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Number(a.id.slice(2)) - Number(b.id.slice(2)));

  const prepPlan: PrepTopic[] = jobFit.requirementMatches
    .filter((match) => match.category !== 'soft')
    .map((match) => ({
      topic: match.requirement,
      importance: match.importance,
      state: match.finalMatchState,
      priority: requirementPriority(match.importance, match.finalMatchState),
      reason: `${match.importance === 'MANDATORY' ? 'Mandatory' : 'Preferred'} — ${STATE_REASON[match.finalMatchState]}.`,
    }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.importance === b.importance ? 0 : a.importance === 'MANDATORY' ? -1 : 1));

  // Interview Readiness (evidence part, 85 points) + practice (15 points).
  const mandatoryCredit = mandatory.length ? mandatory.reduce((total, match) => total + match.credit, 0) / mandatory.length : 1;
  const projectDepth = topProjects.length ? topProjects.reduce((total, p) => total + p.overall, 0) / topProjects.length / 100 : 0;
  const internshipRatio = analyses.internships.length ? analyses.internships.reduce((total, i) => total + i.overall, 0) / analyses.internships.length / 100 : 0.3;
  const missingMandatory = mandatory.filter((m) => m.finalMatchState === 'MISSING').length;
  const gapRatio = mandatory.length ? 1 - missingMandatory / mandatory.length : 1;
  const behavioralRatio = ((softIds.has('teamwork') ? 1 : 0) + (softIds.has('leadership') || softIds.has('ownership') ? 1 : 0) + (resume.achievements.length ? 1 : 0)) / 3;
  const practiced = finalQuestions.filter((question) => practicedIds.includes(question.id)).length;
  const practiceRatio = finalQuestions.length ? practiced / finalQuestions.length : 0;

  const drafts = [
    { id: 'technical', label: 'Technical evidence for mandatory skills', weight: 30, ratio: mandatoryCredit, rule: 'Average match credit of mandatory technical requirements.' },
    { id: 'projects', label: 'Project depth to discuss', weight: 20, ratio: projectDepth, rule: 'Average score of your top two projects.' },
    { id: 'internship', label: 'Internship stories', weight: 10, ratio: internshipRatio, rule: 'Internship quality; 30% baseline if none.' },
    { id: 'gaps', label: 'Exposure to gap questions', weight: 15, ratio: gapRatio, rule: 'Share of mandatory requirements that are not missing.' },
    { id: 'behavioral', label: 'Behavioural evidence', weight: 10, ratio: behavioralRatio, rule: 'Teamwork, leadership/ownership and achievements on the resume.' },
    { id: 'practice', label: 'Practice progress', weight: PRACTICE_WEIGHT, ratio: practiceRatio, rule: 'Share of generated questions you have marked as practised.' },
  ];
  const components: ScoreComponent[] = drafts.map((draft) => ({ ...draft, earned: round1(draft.weight * draft.ratio), status: statusOf(draft.ratio), evidence: [`${Math.round(draft.ratio * 100)}%`], applicable: true }));
  const readiness = round1(components.reduce((total, component) => total + component.earned, 0));
  const evidenceReadiness = round1(components.filter((c) => c.id !== 'practice').reduce((total, c) => total + c.earned, 0));

  const focusAreas = [
    ...jobFit.requirementMatches.filter((m) => m.importance === 'MANDATORY' && m.finalMatchState === 'MISSING').map((m) => `Learn the basics of ${m.requirement} and be honest about it`),
    ...jobFit.requirementMatches.filter((m) => m.finalMatchState === 'WEAK_EVIDENCE').map((m) => `Prepare a concrete example of using ${m.requirement}`),
    ...topProjects.filter((p) => p.dimensions.find((d) => d.id === 'outcome')?.score === 0).map((p) => `Know the measurable results of “${p.title}”`),
  ].slice(0, 6);

  return { readiness, evidenceReadiness, components, questions: finalQuestions, focusAreas, prepPlan };
};
