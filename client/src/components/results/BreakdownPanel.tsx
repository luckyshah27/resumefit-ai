import type { AnalysisReport, ScoreComponent } from '../../types';
import { Card, CardHeader, Meter, StatusDot } from '../ui';

const ComponentList = ({ title, score, components }: { title: string; score: number; components: ScoreComponent[] }) => (
  <div className="min-w-0">
    <div className="mb-3 flex items-baseline justify-between">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <span className="num text-sm text-ink-2">{score.toFixed(1)}</span>
    </div>
    <ul className="space-y-3">
      {components
        .filter((component) => component.applicable)
        .map((component) => (
          <li key={component.id} title={component.rule}>
            <div className="flex items-center gap-2 text-[13px]">
              <StatusDot status={component.status} />
              <span className="min-w-0 flex-1 truncate text-ink-2">{component.label}</span>
              <span className="num shrink-0 text-ink-3">
                {component.earned.toFixed(1)}
                <span className="text-ink-4"> / {component.weight.toFixed(1)}</span>
              </span>
            </div>
            <Meter value={component.earned} max={component.weight} tone="auto" className="ml-6 mt-1.5 w-[calc(100%-1.5rem)]" />
            <p className="ml-6 mt-1 text-xs leading-snug text-ink-4">{component.rule}</p>
          </li>
        ))}
    </ul>
  </div>
);

export const BreakdownPanel = ({ report }: { report: AnalysisReport }) => (
  <Card as="section" id="breakdown">
    <CardHeader title="Score breakdown" description="Three independent scores. Weights are normalised to 100 over the components that apply to this job." />
    <div className="grid gap-8 p-5 lg:grid-cols-3">
      <ComponentList title="Job Fit" score={report.scores.jobFit} components={report.jobFit.components} />
      <ComponentList title="ATS Readiness" score={report.scores.atsReadiness} components={report.ats.checks} />
      <ComponentList title="Resume Quality" score={report.scores.resumeQuality} components={report.quality.components} />
    </div>
    {report.ats.issues.length > 0 && (
      <div className="border-t border-line p-5">
        <h3 className="eyebrow mb-2">ATS observations</h3>
        <ul className="space-y-1.5 text-[13px]">
          {report.ats.issues.map((issue, index) => (
            <li key={index} className="flex gap-2">
              <span className={issue.severity === 'high' ? 'text-bad' : issue.severity === 'medium' ? 'text-warn' : 'text-ink-4'} aria-hidden>
                ●
              </span>
              <span className="text-ink-2">
                <span className="sr-only">{issue.severity} severity: </span>
                {issue.message}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-4">{report.ats.disclaimer}</p>
      </div>
    )}
  </Card>
);
