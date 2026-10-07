import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Analysis, ReportComparison } from '../../types';
import { Delta, Meter, ScoreRing, scoreBand } from '../ui';

const SecondaryScore = ({ label, value, description, delta, href }: { label: string; value: number; description: string; delta?: number | null; href: string }) => (
  <a href={href} className="focus-ring group flex items-center gap-4 rounded-lg border border-line bg-white p-4 shadow-card transition hover:border-line-strong">
    <ScoreRing value={value} size={64} stroke={5} label={label} />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{label}</span>
        {delta !== undefined && delta !== null && <Delta value={delta} className="text-xs" />}
      </div>
      <div className="mt-0.5 text-xs leading-relaxed text-ink-3">{description}</div>
    </div>
  </a>
);

export const ScoreHero = ({ analysis, comparison }: { analysis: Analysis; comparison: ReportComparison | null }) => {
  const { report } = analysis;
  const delta = (key: 'jobFit' | 'atsReadiness' | 'resumeQuality' | 'interviewReadiness') => comparison?.scores.find((score) => score.key === key)?.delta ?? null;
  const { summary } = report.jobFit;
  const total = summary.matched + summary.partial + summary.weak + summary.missing;

  return (
    <section aria-labelledby="score-heading" className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="rounded-lg border border-line bg-white p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing value={report.scores.jobFit} size={112} stroke={10} label="Job Fit" showValue={false} />
          <div className="min-w-0">
            <h2 id="score-heading" className="eyebrow">
              Job Fit
            </h2>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-5xl font-semibold tracking-[-0.04em] text-ink">{Math.round(report.scores.jobFit)}</span>
              <span className="text-xl font-medium text-ink-4">/ 100</span>
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">{scoreBand(report.scores.jobFit)}</span>
              {delta('jobFit') !== null && <Delta value={delta('jobFit')} className="text-sm" />}
            </div>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-2">{report.summary}</p>
          </div>
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <div className="flex h-2 overflow-hidden rounded-full bg-[#EFEEEA]" role="img" aria-label={`${summary.matched} matched, ${summary.weak} weak evidence, ${summary.partial} transferable, ${summary.missing} missing`}>
            {[
              { count: summary.matched, color: 'bg-good' },
              { count: summary.weak, color: 'bg-[#D9A53A]' },
              { count: summary.partial, color: 'bg-[#E7C77C]' },
              { count: summary.missing, color: 'bg-[#C2410C]' },
            ].map((segment, index) =>
              segment.count ? <div key={index} className={`${segment.color} h-full border-r-2 border-white last:border-r-0`} style={{ width: `${(segment.count / Math.max(1, total)) * 100}%` }} /> : null,
            )}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            {[
              { label: 'Matched', value: summary.matched, dot: 'bg-good' },
              { label: 'Weak evidence', value: summary.weak, dot: 'bg-[#D9A53A]' },
              { label: 'Transferable', value: summary.partial, dot: 'bg-[#E7C77C]' },
              { label: 'Missing', value: summary.missing, dot: 'bg-[#C2410C]' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${item.dot}`} aria-hidden />
                <dt className="text-ink-3">{item.label}</dt>
                <dd className="num ml-auto font-medium text-ink sm:ml-0">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="grid gap-3">
        <SecondaryScore label="ATS Readiness" value={report.scores.atsReadiness} delta={delta('atsReadiness')} href="#breakdown" description="How reliably applicant tracking systems can parse this resume (estimate)." />
        <SecondaryScore label="Resume Quality" value={report.scores.resumeQuality} delta={delta('resumeQuality')} href="#breakdown" description="Completeness, specificity, action verbs, outcomes and project depth." />
        <Link to={`/results/${analysis.id}/interview`} className="focus-ring group flex items-center justify-between gap-4 rounded-lg border border-line bg-white px-4 py-3.5 shadow-card transition hover:border-line-strong">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-ink">Interview readiness</span>
              <span className="num text-sm text-ink-2">{Math.round(report.scores.interviewReadiness)}/100</span>
            </div>
            <Meter value={report.scores.interviewReadiness} tone="brand" className="mt-2" />
          </div>
          <span className="flex items-center gap-1 text-[13px] font-medium text-ink-2 group-hover:text-ink">
            Prepare <ArrowRight className="size-3.5" />
          </span>
        </Link>
      </div>
    </section>
  );
};
