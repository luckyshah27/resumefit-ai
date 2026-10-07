import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { getAnalysis, setPracticed } from '../api/client';
import type { Analysis, InterviewQuestion } from '../types';
import { Alert, Badge, Card, CardHeader, Meter, PageHeader, ScoreRing, Spinner, StatusDot, Tabs, cx } from '../components/ui';

const CATEGORY_LABEL: Record<InterviewQuestion['category'], string> = {
  technical: 'Technical',
  project: 'Projects & internship',
  role: 'Role-specific',
  gap: 'Skill gaps',
  behavioral: 'Behavioural',
  'system-design': 'System design',
};

type Filter = 'all' | InterviewQuestion['category'];

const PRIORITY_TONE = { HIGH: 'bad', MEDIUM: 'warn', LOW: 'neutral' } as const;
const PRIORITY_HINT = { HIGH: 'mandatory gaps', MEDIUM: 'depth & preferred gaps', LOW: 'already strong' } as const;

export const InterviewPage = () => {
  const { id = '' } = useParams();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    getAnalysis(id)
      .then(setAnalysis)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load analysis'));
  }, [id]);

  const questions = useMemo(() => analysis?.report.interview.questions ?? [], [analysis]);
  const categories = useMemo(() => [...new Set(questions.map((question) => question.category))], [questions]);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!analysis) return <Spinner label="Loading interview preparation" />;
  const { interview } = analysis.report;
  const practiced = new Set(analysis.practicedQuestionIds);

  const toggle = async (questionId: string) => {
    setPending(questionId);
    try {
      const result = await setPracticed(analysis.id, questionId, !practiced.has(questionId));
      setAnalysis({ ...analysis, practicedQuestionIds: result.practicedQuestionIds, scores: result.scores, report: { ...analysis.report, interview: result.interview, scores: result.scores } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setPending(null);
    }
  };

  const visible = questions.filter((question) => filter === 'all' || question.category === filter);

  return (
    <div className="space-y-6">
      <Link to={`/results/${analysis.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> Back to results
      </Link>
      <PageHeader eyebrow="Interview preparation" title={`${analysis.report.job.role}${analysis.report.job.company ? ` · ${analysis.report.job.company}` : ''}`} description="Questions generated from this job's requirements and responsibilities, your projects and internships, and your skill gaps." />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-6">
          <div className="flex items-center gap-5">
            <ScoreRing value={interview.readiness} size={112} stroke={7} label="Interview readiness" />
            <div>
              <div className="eyebrow">Interview readiness</div>
              <div className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-ink">
                {Math.round(interview.readiness)}
                <span className="text-lg font-medium text-ink-4"> / 100</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                Resume evidence {interview.evidenceReadiness.toFixed(1)}/85 · practice {(interview.readiness - interview.evidenceReadiness).toFixed(1)}/15
              </p>
            </div>
          </div>
          <ul className="mt-6 space-y-3">
            {interview.components.map((component) => (
              <li key={component.id} title={component.rule}>
                <div className="flex items-center gap-2 text-[13px]">
                  <StatusDot status={component.status} />
                  <span className="flex-1 text-ink-2">{component.label}</span>
                  <span className="num text-ink-3">
                    {component.earned.toFixed(1)}/{component.weight}
                  </span>
                </div>
                <Meter value={component.earned} max={component.weight} tone="auto" className="ml-6 mt-1 w-[calc(100%-1.5rem)]" />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Focus areas" description="Where interviewers are most likely to probe, based on your gaps." />
          {interview.focusAreas.length ? (
            <ol className="space-y-2 p-5 text-sm">
              {interview.focusAreas.map((area, index) => (
                <li key={area} className="flex gap-3">
                  <span className="num flex size-5 shrink-0 items-center justify-center rounded bg-brand-50 text-2xs font-semibold text-brand-700">{index + 1}</span>
                  <span className="text-ink-2">{area}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="p-5 text-sm text-ink-3">No major gaps detected for this role.</p>
          )}
          <div className="border-t border-line px-5 py-3 text-xs text-ink-3">
            Practised {practiced.size} of {questions.length} questions. Marking questions as practised raises the practice component of readiness.
          </div>
        </Card>
      </div>

      {interview.prepPlan && interview.prepPlan.length > 0 && (
        <Card>
          <CardHeader title="Preparation priority" description="What to study first, derived from how each requirement matched your resume." />
          <div className="grid gap-px bg-line md:grid-cols-3">
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map((priority) => {
              const topics = interview.prepPlan!.filter((topic) => topic.priority === priority);
              return (
                <div key={priority} className="bg-white p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Badge tone={PRIORITY_TONE[priority]}>{priority}</Badge>
                    <span className="text-xs text-ink-3">{PRIORITY_HINT[priority]}</span>
                  </div>
                  {topics.length ? (
                    <ul className="space-y-2">
                      {topics.map((topic) => (
                        <li key={topic.topic} className="text-[13px]">
                          <div className="font-medium text-ink">{topic.topic}</div>
                          <div className="text-xs text-ink-3">{topic.reason}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-ink-3">Nothing here.</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Questions"
          action={<Tabs value={filter} onChange={setFilter} items={[{ value: 'all' as Filter, label: 'All', count: questions.length }, ...categories.map((category) => ({ value: category as Filter, label: CATEGORY_LABEL[category], count: questions.filter((q) => q.category === category).length }))]} />}
        />
        <ul className="divide-y divide-line">
          {visible.map((question) => {
            const done = practiced.has(question.id);
            return (
              <li key={question.id} className="flex gap-4 px-5 py-4">
                <button
                  type="button"
                  onClick={() => toggle(question.id)}
                  disabled={pending === question.id}
                  aria-pressed={done}
                  aria-label={done ? 'Mark as not practised' : 'Mark as practised'}
                  className={cx('focus-ring mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition', done ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-white hover:border-brand-500')}
                >
                  {done && <Check className="size-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {question.priority && <Badge tone={PRIORITY_TONE[question.priority]}>{question.priority} priority</Badge>}
                    <Badge tone="outline">{CATEGORY_LABEL[question.category]}</Badge>
                    <Badge tone="neutral">{question.difficulty}</Badge>
                    {question.relatedRequirement && <span className="text-xs text-ink-4">{question.relatedRequirement}</span>}
                  </div>
                  <p className={cx('mt-2 text-sm font-medium', done ? 'text-ink-3' : 'text-ink')}>{question.question}</p>
                  <p className="mt-1 text-xs text-ink-3">Why this question: {question.why}</p>
                  {question.tips.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-ink-2">
                      {question.tips.map((tip) => (
                        <li key={tip}>— {tip}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
};
