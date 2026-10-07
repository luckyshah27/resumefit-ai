import { Fragment, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AnalysisReport, MatchState, RequirementMatch } from '../../types';
import { Badge, Card, CardHeader, MatchBadge, Tabs, cx } from '../ui';

type Filter = 'all' | 'matched' | 'weak' | 'partial' | 'missing';

const FILTERS: Record<Filter, MatchState[]> = {
  all: ['STRONG_MATCH', 'MATCH', 'WEAK_EVIDENCE', 'PARTIAL_MATCH', 'MISSING'],
  matched: ['STRONG_MATCH', 'MATCH'],
  weak: ['WEAK_EVIDENCE'],
  partial: ['PARTIAL_MATCH'],
  missing: ['MISSING'],
};

const STATE_ORDER: Record<MatchState, number> = { MISSING: 0, PARTIAL_MATCH: 1, WEAK_EVIDENCE: 2, MATCH: 3, STRONG_MATCH: 4 };

const SOURCE_LABEL: Record<string, string> = {
  skills: 'Skills list',
  project: 'Project',
  experience: 'Experience',
  internship: 'Internship',
  summary: 'Summary',
  certification: 'Certification',
  achievement: 'Achievement',
  education: 'Education',
  other: 'Other',
};

const RequirementRow = ({ match }: { match: RequirementMatch }) => {
  const [open, setOpen] = useState(false);
  const first = match.evidence[0];
  return (
    <Fragment>
      <tr className={cx('border-b border-line align-top transition', open ? 'bg-canvas' : 'hover:bg-canvas/60')}>
        <td className="py-3 pl-5 pr-3">
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="focus-ring flex items-start gap-2 rounded text-left">
            <ChevronDown className={cx('mt-0.5 size-4 shrink-0 text-ink-4 transition', open && 'rotate-180')} aria-hidden />
            <span>
              <span className="block text-sm font-medium text-ink">{match.requirement}</span>
              {match.originalPhrase.toLowerCase() !== match.requirement.toLowerCase() && <span className="block text-xs text-ink-3">JD says “{match.originalPhrase}”</span>}
            </span>
          </button>
        </td>
        <td className="hidden py-3 pr-3 sm:table-cell">
          <Badge tone={match.importance === 'MANDATORY' ? 'outline' : 'neutral'}>{match.importance === 'MANDATORY' ? 'Mandatory' : 'Preferred'}</Badge>
        </td>
        <td className="py-3 pr-3">
          <MatchBadge state={match.finalMatchState} />
        </td>
        <td className="hidden py-3 pr-5 text-[13px] text-ink-2 md:table-cell">
          {first ? (
            <span className="line-clamp-2">
              <span className="mr-1.5 text-ink-4">{SOURCE_LABEL[first.source] ?? first.source}:</span>
              {first.text}
            </span>
          ) : match.semanticMatch ? (
            <span className="text-ink-3">Related: {match.semanticMatch.relatedSkillName}</span>
          ) : (
            <span className="text-ink-4">No evidence found</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-canvas">
          <td colSpan={4} className="px-5 pb-4 pt-0">
            <div className="ml-6 space-y-3 text-[13px]">
              <p className="text-ink-2">{match.explanation}</p>
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-4">
                <div>
                  <dt className="text-ink-4">Exact match</dt>
                  <dd className="text-ink">{match.exactMatch ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="text-ink-4">Semantic match</dt>
                  <dd className="text-ink">{match.semanticMatch ? `${match.semanticMatch.relatedSkillName} (${match.semanticMatch.relation})` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-ink-4">Evidence strength</dt>
                  <dd className="text-ink">{match.evidenceStrength === 'NONE' ? '—' : match.evidenceStrength.toLowerCase()}</dd>
                </div>
                <div>
                  <dt className="text-ink-4">Credit</dt>
                  <dd className="num text-ink">{Math.round(match.credit * 100)}%</dd>
                </div>
              </dl>
              {match.evidence.length > 0 && (
                <ul className="space-y-1.5">
                  {match.evidence.map((item, index) => (
                    <li key={index} className="rounded border border-line bg-white px-3 py-2">
                      <span className="mr-2 text-2xs font-medium uppercase tracking-wide text-ink-4">
                        {SOURCE_LABEL[item.source] ?? item.source}
                        {item.entryTitle ? ` · ${item.entryTitle}` : ''}
                      </span>
                      <span className="text-ink-2">{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
};

export const RequirementsPanel = ({ report }: { report: AnalysisReport }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const matches = report.jobFit.requirementMatches;
  const count = (key: Filter) => matches.filter((match) => FILTERS[key].includes(match.finalMatchState)).length;
  const rows = useMemo(
    () =>
      matches
        .filter((match) => FILTERS[filter].includes(match.finalMatchState))
        .sort((a, b) => (a.importance === b.importance ? STATE_ORDER[a.finalMatchState] - STATE_ORDER[b.finalMatchState] : a.importance === 'MANDATORY' ? -1 : 1)),
    [matches, filter],
  );

  return (
    <Card as="section" id="requirements">
      <CardHeader
        title="Requirement comparison"
        description="Each JD requirement, normalised to a canonical skill, checked against evidence in your resume."
        action={
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { value: 'all', label: 'All', count: matches.length },
              { value: 'matched', label: 'Matched', count: count('matched') },
              { value: 'weak', label: 'Weak evidence', count: count('weak') },
              { value: 'partial', label: 'Transferable', count: count('partial') },
              { value: 'missing', label: 'Missing', count: count('missing') },
            ]}
          />
        }
      />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-line text-left text-2xs font-medium uppercase tracking-wide text-ink-4">
                <th className="py-2 pl-5 pr-3 font-medium">Requirement</th>
                <th className="hidden py-2 pr-3 font-medium sm:table-cell">Importance</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="hidden py-2 pr-5 font-medium md:table-cell">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((match) => (
                <RequirementRow key={match.requirementId} match={match} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-ink-3">No requirements in this group.</p>
      )}

      {report.jobFit.responsibilityMatches.length > 0 && (
        <div className="border-t border-line p-5">
          <h3 className="eyebrow mb-3">Responsibility alignment</h3>
          <ul className="space-y-2.5">
            {report.jobFit.responsibilityMatches.map((match) => (
              <li key={match.requirementId} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0 text-[13px]">
                  <div className="text-ink">{match.responsibility}</div>
                  {match.bestEvidence && <div className="mt-0.5 line-clamp-1 text-ink-3">Closest evidence: {match.bestEvidence}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="num text-xs text-ink-3">{Math.round(match.coverage * 100)}%</span>
                  <MatchBadge state={match.finalMatchState} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};
