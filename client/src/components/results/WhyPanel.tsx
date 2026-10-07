import type { AnalysisReport, ScoreComponent } from '../../types';
import { Card, CardHeader, Meter, StatusDot } from '../ui';

const weakest = (components: ScoreComponent[]) =>
  [...components].filter((component) => component.applicable && component.weight - component.earned > 0.05).sort((a, b) => b.weight - b.earned - (a.weight - a.earned))[0];

/** Answers "why did I get this score?" with the engine's own categories, weights and evidence. */
export const WhyPanel = ({ report }: { report: AnalysisReport }) => {
  const applicable = report.jobFit.components.filter((component) => component.applicable);
  const notScored = report.jobFit.components.filter((component) => !component.applicable);
  const atsWeakest = weakest(report.ats.checks);
  const qualityWeakest = weakest(report.quality.components);

  return (
    <Card as="section" id="why">
      <CardHeader
        title="Why did I get this score?"
        description="Job Fit is the sum of these categories. Each one is computed by the deterministic engine from the evidence shown — no AI decides any number."
      />
      <ul className="divide-y divide-line">
        {applicable.map((component) => (
          <li key={component.id} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-center sm:gap-6">
            <div className="flex items-center gap-2">
              <StatusDot status={component.status} />
              <span className="text-sm font-medium text-ink">{component.label}</span>
            </div>
            <div className="min-w-0">
              <Meter value={component.earned} max={component.weight} tone="auto" />
              <p className="mt-1.5 text-[13px] leading-snug text-ink-2">{component.summary ?? component.rule}</p>
            </div>
            <div className="num text-right text-sm text-ink sm:w-28">
              <span className="font-semibold">{component.earned.toFixed(1)}</span>
              <span className="text-ink-3"> / {component.weight.toFixed(1)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3 text-[13px]">
        <span className="text-ink-3">
          {applicable.map((component) => component.earned.toFixed(1)).join(' + ')} ={' '}
          <span className="num font-semibold text-ink">{report.scores.jobFit.toFixed(1)}</span>
        </span>
        <span className="text-ink-3">Scoring engine {report.scoringVersion}</span>
      </div>
      {notScored.length > 0 && (
        <p className="border-t border-line px-5 py-3 text-xs text-ink-3">
          Not scored for this job: {notScored.map((component) => `${component.label.toLowerCase()} (${component.summary ?? 'not applicable'})`).join(' ')} Their weight is shared proportionally by the categories above.
        </p>
      )}
      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
        <div className="bg-white px-5 py-3.5 text-[13px]">
          <div className="font-medium text-ink">ATS Readiness · {report.scores.atsReadiness.toFixed(1)}</div>
          <p className="mt-0.5 text-ink-3">{atsWeakest ? `Biggest deduction — ${atsWeakest.label}: ${atsWeakest.summary}` : 'No parsing risks detected.'}</p>
        </div>
        <div className="bg-white px-5 py-3.5 text-[13px]">
          <div className="font-medium text-ink">Resume Quality · {report.scores.resumeQuality.toFixed(1)}</div>
          <p className="mt-0.5 text-ink-3">{qualityWeakest ? `Biggest deduction — ${qualityWeakest.label}: ${qualityWeakest.summary}` : 'All quality dimensions are at full marks.'}</p>
        </div>
      </div>
    </Card>
  );
};
