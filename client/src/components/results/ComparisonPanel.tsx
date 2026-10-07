import { Link } from 'react-router-dom';
import type { AnalysisSummary, ReportComparison } from '../../types';
import { Card, CardHeader, Delta, MatchBadge } from '../ui';
import type { MatchState } from '../../types';
import { AttributionList } from './AttributionList';

/** Before/after view. Every number here comes from two runs of the same deterministic engine. */
export const ComparisonPanel = ({ comparison, before, current }: { comparison: ReportComparison; before: AnalysisSummary; current: AnalysisSummary }) => {
  const headline = comparison.scores.filter((score) => score.key !== 'interviewReadiness');
  return (
    <Card as="section" id="comparison">
      <CardHeader
        eyebrow="What improved"
        title={`Version ${before.versionNumber} → Version ${current.versionNumber}`}
        description="Both versions were scored by the same engine against the same job description."
        action={
          <Link to={`/results/${before.id}`} className="text-[13px] font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            View previous analysis
          </Link>
        }
      />
      <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {headline.map((score) => (
          <div key={score.key} className="px-5 py-4">
            <div className="text-[13px] text-ink-3">{score.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-sm text-ink-4">{score.before.toFixed(1)}</span>
              <span className="text-ink-4">→</span>
              <span className="text-2xl font-semibold tracking-[-0.02em] text-ink">{score.after.toFixed(1)}</span>
              <Delta value={score.delta} className="text-sm" />
            </div>
          </div>
        ))}
      </div>
      {(comparison.changedCategories.length > 0 || comparison.requirementChanges.length > 0) && (
        <div className="grid gap-6 border-t border-line p-5 md:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-2">Categories that changed</h3>
            {comparison.changedCategories.length ? (
              <table className="w-full text-[13px]">
                <tbody>
                  {comparison.changedCategories.map((category) => (
                    <tr key={`${category.group}-${category.id}`} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-2 text-ink-3">{category.group}</td>
                      <td className="py-1.5 pr-2 text-ink">{category.label}</td>
                      <td className="num py-1.5 pr-2 text-right text-ink-3">
                        {category.before.toFixed(1)} → {category.after.toFixed(1)}
                      </td>
                      <td className="py-1.5 text-right">
                        <Delta value={category.delta} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[13px] text-ink-3">No category moved by 0.1 points or more.</p>
            )}
          </div>
          <div>
            <h3 className="eyebrow mb-2">Requirement status changes</h3>
            {comparison.requirementChanges.length ? (
              <ul className="space-y-2 text-[13px]">
                {comparison.requirementChanges.map((change) => (
                  <li key={change.requirement} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{change.requirement}</span>
                    {change.before !== 'NEW' && <MatchBadge state={change.before as MatchState} />}
                    <span className="text-ink-4">→</span>
                    <MatchBadge state={change.after as MatchState} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">No requirement changed state.</p>
            )}
          </div>
        </div>
      )}
      {comparison.attribution && comparison.attribution.length > 0 && (
        <div className="border-t border-line p-5">
          <AttributionList attribution={comparison.attribution} />
        </div>
      )}
    </Card>
  );
};
