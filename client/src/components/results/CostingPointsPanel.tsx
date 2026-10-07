import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AnalysisReport, PointLoss } from '../../types';
import { Card, CardHeader, Tabs, cx } from '../ui';

type Key = 'jobFit' | 'atsReadiness' | 'resumeQuality';

const LossRow = ({ loss, max }: { loss: PointLoss; max: number }) => {
  const [open, setOpen] = useState(false);
  const hasItems = loss.items.length > 0;
  return (
    <li className="border-b border-line last:border-0">
      <button type="button" disabled={!hasItems} onClick={() => setOpen((value) => !value)} aria-expanded={open} className="focus-ring grid w-full grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-5 py-3 text-left disabled:cursor-default">
        <span className="num text-[15px] font-semibold text-bad">−{loss.points.toFixed(1)}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{loss.label}</span>
          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-[#EFEEEA]">
            <span className="block h-full rounded-full bg-[#C2410C]/70" style={{ width: `${(loss.points / max) * 100}%` }} />
          </span>
        </span>
        {hasItems ? <ChevronDown className={cx('size-4 text-ink-4 transition', open && 'rotate-180')} aria-hidden /> : <span />}
      </button>
      {open && (
        <ul className="space-y-1 px-5 pb-3 pl-[6.25rem] text-[13px]">
          {loss.items.map((item, index) => (
            <li key={index} className="flex items-start justify-between gap-3">
              <span className="text-ink-2">{item.label}</span>
              {item.points > 0 && <span className="num shrink-0 text-ink-3">−{item.points.toFixed(1)}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export const CostingPointsPanel = ({ report }: { report: AnalysisReport }) => {
  const [key, setKey] = useState<Key>('jobFit');
  const losses = report.costingPoints[key];
  const score = report.scores[key];
  const total = losses.reduce((sum, loss) => sum + loss.points, 0);
  const max = Math.max(...losses.map((loss) => loss.points), 1);
  const label = { jobFit: 'Job Fit', atsReadiness: 'ATS Readiness', resumeQuality: 'Resume Quality' }[key];

  return (
    <Card as="section" id="costing">
      <CardHeader
        title="What is costing me points?"
        description="Every deduction is computed by the scoring engine and traced to a specific requirement or rule."
        action={
          <Tabs
            value={key}
            onChange={setKey}
            items={[
              { value: 'jobFit', label: 'Job Fit' },
              { value: 'atsReadiness', label: 'ATS' },
              { value: 'resumeQuality', label: 'Quality' },
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line px-5 py-3 text-[13px]">
        <span className="text-ink-3">
          {label}: <span className="num font-semibold text-ink">{score.toFixed(1)}</span>
        </span>
        <span className="text-ink-3">
          Points not earned: <span className="num font-semibold text-ink">{total.toFixed(1)}</span>
        </span>
      </div>
      {losses.length ? (
        <ul>
          {losses.map((loss) => (
            <LossRow key={loss.id} loss={loss} max={max} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-ink-3">Nothing is costing points here.</p>
      )}
      {key === 'atsReadiness' && <p className="border-t border-line px-5 py-3 text-xs text-ink-3">{report.ats.disclaimer}</p>}
    </Card>
  );
};
