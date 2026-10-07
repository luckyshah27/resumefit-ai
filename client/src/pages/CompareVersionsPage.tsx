import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { compareVersions, downloadResume } from '../api/client';
import type { MatchState, VersionComparison } from '../types';
import { Alert, Card, CardHeader, Delta, MatchBadge, PageHeader, Spinner, cx } from '../components/ui';
import { DownloadMenu } from '../components/DownloadMenu';
import { AttributionList } from '../components/results/AttributionList';

const LABELS = { jobFit: 'Job Fit', atsReadiness: 'ATS Readiness', resumeQuality: 'Resume Quality', interviewReadiness: 'Interview readiness' } as const;
const GROUP = { jobFit: 'Job Fit', atsReadiness: 'ATS', resumeQuality: 'Quality' } as Record<string, string>;

export const CompareVersionsPage = () => {
  const { a = '', b = '' } = useParams();
  const [data, setData] = useState<VersionComparison | null>(null);
  const [error, setError] = useState('');
  const [onlyChanges, setOnlyChanges] = useState(true);

  useEffect(() => {
    compareVersions(a, b)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not compare versions'));
  }, [a, b]);

  if (error) return <Alert tone="bad">{error}</Alert>;
  if (!data) return <Spinner label="Comparing versions" />;

  // Keep one line of context around each change and mark skipped runs with a gap row.
  const diff: Array<VersionComparison['diff'][number] | { type: 'gap'; text: string }> = [];
  data.diff.forEach((line, index) => {
    const keep = !onlyChanges || line.type !== 'same' || data.diff.slice(Math.max(0, index - 1), index + 2).some((neighbour) => neighbour.type !== 'same');
    if (keep) diff.push(line);
    else if (diff[diff.length - 1]?.type !== 'gap') diff.push({ type: 'gap', text: '' });
  });
  while (diff[0]?.type === 'gap') diff.shift();
  while (diff[diff.length - 1]?.type === 'gap') diff.pop();

  return (
    <div className="space-y-6">
      <Link to="/resumes" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> All resumes
      </Link>
      <PageHeader
        eyebrow="Compare versions"
        title={`Version ${data.older.versionNumber} → Version ${data.newer.versionNumber}`}
        description={`${data.older.label} → ${data.newer.label}`}
        actions={
          <DownloadMenu
            onError={setError}
            items={[
              { label: `Version ${data.newer.versionNumber} (DOCX)`, run: () => downloadResume(data.newer.id, 'docx') },
              { label: `Version ${data.newer.versionNumber} (PDF)`, run: () => downloadResume(data.newer.id, 'pdf') },
              { label: `Version ${data.older.versionNumber} (DOCX)`, run: () => downloadResume(data.older.id, 'docx') },
              { label: `Version ${data.older.versionNumber} (PDF)`, run: () => downloadResume(data.older.id, 'pdf') },
            ]}
          />
        }
      />

      {!data.sameJobDescription && <Alert tone="warn" title="Scored against different job descriptions">Score differences reflect both the resume changes and the change of job. Re-analyze both versions against the same job for a like-for-like comparison.</Alert>}

      <Card>
        <div className="grid divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {data.scoreDeltas.map((delta) => (
            <div key={delta.key} className="px-5 py-4">
              <div className="text-[13px] text-ink-3">{LABELS[delta.key]}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="num text-sm text-ink-4">{delta.before?.toFixed(1) ?? '—'}</span>
                <span className="text-ink-4">→</span>
                <span className="text-xl font-semibold text-ink">{delta.after?.toFixed(1) ?? '—'}</span>
                <Delta value={delta.delta} className="text-sm" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {data.categoryDeltas.length > 0 && (
        <Card>
          <CardHeader title="Categories that changed" />
          <table className="w-full text-[13px]">
            <tbody>
              {data.categoryDeltas.map((category) => (
                <tr key={`${category.group}-${category.id}`} className="border-b border-line last:border-0">
                  <td className="py-2 pl-5 pr-3 text-ink-3">{GROUP[category.group]}</td>
                  <td className="py-2 pr-3 text-ink">{category.label}</td>
                  <td className="num py-2 pr-3 text-right text-ink-3">
                    {category.before.toFixed(1)} → {category.after.toFixed(1)}
                  </td>
                  <td className="py-2 pr-5 text-right">
                    <Delta value={category.delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {data.comparison && (data.comparison.requirementChanges.length > 0 || (data.comparison.attribution?.length ?? 0) > 0) && (
        <Card>
          <CardHeader title="Why the scores changed" description="Recomputed by the same engine for both versions; edits are linked to the differences they touched." />
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h3 className="eyebrow mb-2">Requirement status changes</h3>
              {data.comparison.requirementChanges.length ? (
                <ul className="space-y-2 text-[13px]">
                  {data.comparison.requirementChanges.map((change) => (
                    <li key={change.requirement} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{change.requirement}</span>
                      {change.before !== 'NEW' && <MatchBadge state={change.before as MatchState} />}
                      <span className="text-ink-3">→</span>
                      <MatchBadge state={change.after as MatchState} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-ink-3">No requirement changed state.</p>
              )}
            </div>
            <AttributionList attribution={data.comparison.attribution ?? []} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Text changes"
          action={
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" className="size-4 accent-[#111113]" checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} />
              Only changed lines
            </label>
          }
        />
        <div className="overflow-x-auto py-2 font-mono text-[12.5px] leading-6">
          {diff.length === 0 && <p className="px-5 py-6 text-center font-sans text-sm text-ink-3">The text is identical.</p>}
          {diff.map((line, index) =>
            line.type === 'gap' ? (
              <div key={index} className="select-none px-5 text-ink-4" aria-label="Unchanged lines hidden">
                ⋯
              </div>
            ) : (
            <div key={index} className={cx('flex whitespace-pre-wrap px-5', line.type === 'added' && 'bg-good-bg text-good', line.type === 'removed' && 'bg-bad-bg text-bad line-through decoration-bad/40', line.type === 'same' && 'text-ink-3')}>
              <span className="mr-3 w-3 shrink-0 select-none" aria-hidden>
                {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
              </span>
              <span className="sr-only">{line.type === 'added' ? 'Added: ' : line.type === 'removed' ? 'Removed: ' : ''}</span>
              {line.text || ' '}
            </div>
            ),
          )}
        </div>
      </Card>
    </div>
  );
};
