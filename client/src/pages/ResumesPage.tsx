import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileStack, GitCompare, Pencil, RotateCcw } from 'lucide-react';
import { downloadResume, listResumes, restoreVersion } from '../api/client';
import type { ResumeFamily, VersionSummary } from '../types';
import { Alert, Badge, Button, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Spinner, cx, formatDate } from '../components/ui';

const SOURCE_LABEL: Record<VersionSummary['source'], string> = { upload: 'Uploaded', paste: 'Pasted', fix: 'Fixes applied', edit: 'Manual edit', restore: 'Restored' };

const ResumeCard = ({ resume, focused, onRestored }: { resume: ResumeFamily; focused: boolean; onRestored: (analysisId: string) => void }) => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState('');
  const versions = [...resume.versions].sort((a, b) => b.versionNumber - a.versionNumber);
  const latest = versions[0];

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current.slice(-1), id]));

  const restore = async (version: VersionSummary) => {
    setRestoring(version.id);
    setError('');
    try {
      const result = await restoreVersion(version.id);
      onRestored(result.analysis.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
      setRestoring(null);
    }
  };

  return (
    <Card className={cx(focused && 'ring-2 ring-brand-100')}>
      <CardHeader
        title={resume.title}
        description={`${resume.versions.length} version${resume.versions.length === 1 ? '' : 's'} · updated ${formatDate(resume.updatedAt)}`}
        action={
          <div className="flex gap-2">
            <Button size="sm" icon={<GitCompare className="size-3.5" />} disabled={selected.length !== 2} onClick={() => navigate(`/resumes/compare/${selected[0]}/${selected[1]}`)}>
              Compare {selected.length === 2 ? '' : `(${selected.length}/2)`}
            </Button>
            <ButtonLink size="sm" to={`/resumes/${resume.id}/edit`} icon={<Pencil className="size-3.5" />}>
              Edit latest
            </ButtonLink>
          </div>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-4">
              <th className="w-10 py-2 pl-5 font-medium">
                <span className="sr-only">Select</span>
              </th>
              <th className="py-2 pr-3 font-medium">Version</th>
              <th className="py-2 pr-3 font-medium">Scored against</th>
              <th className="py-2 pr-3 text-right font-medium">Job Fit</th>
              <th className="py-2 pr-3 text-right font-medium">ATS</th>
              <th className="py-2 pr-3 text-right font-medium">Quality</th>
              <th className="py-2 pr-5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                <td className="py-3 pl-5">
                  <input type="checkbox" className="size-4 accent-[#111113]" checked={selected.includes(version.id)} onChange={() => toggle(version.id)} aria-label={`Select version ${version.versionNumber} to compare`} />
                </td>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">v{version.versionNumber}</span>
                    {version === latest && <Badge tone="brand">Latest</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-3">
                    {version.label} · {SOURCE_LABEL[version.source]}
                    {version.changeCount ? ` · ${version.changeCount} change${version.changeCount === 1 ? '' : 's'}` : ''} · {formatDate(version.createdAt, true)}
                  </div>
                </td>
                <td className="py-3 pr-3 text-ink-2">{version.job ? `${version.job.role}${version.job.company ? ` · ${version.job.company}` : ''}` : '—'}</td>
                <td className="num py-3 pr-3 text-right font-medium text-ink">{version.scores?.jobFit.toFixed(1) ?? '—'}</td>
                <td className="num py-3 pr-3 text-right text-ink-2">{version.scores?.atsReadiness.toFixed(1) ?? '—'}</td>
                <td className="num py-3 pr-3 text-right text-ink-2">{version.scores?.resumeQuality.toFixed(1) ?? '—'}</td>
                <td className="py-3 pr-5">
                  <div className="flex justify-end gap-1">
                    {version.analysisId && (
                      <Link to={`/results/${version.analysisId}`} className="rounded px-2 py-1 font-medium text-ink-2 hover:bg-brand-50 hover:text-brand-700">
                        Results
                      </Link>
                    )}
                    <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} aria-label={`Download version ${version.versionNumber} as DOCX`} onClick={() => downloadResume(version.id, 'docx').catch((e) => setError(e instanceof Error ? e.message : 'Download failed'))}>
                      DOCX
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Download version ${version.versionNumber} as PDF`} onClick={() => downloadResume(version.id, 'pdf').catch((e) => setError(e instanceof Error ? e.message : 'Download failed'))}>
                      PDF
                    </Button>
                    {version !== latest && (
                      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} loading={restoring === version.id} onClick={() => restore(version)}>
                        Restore
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <div className="p-4">
          <Alert tone="bad">{error}</Alert>
        </div>
      )}
    </Card>
  );
};

export const ResumesPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [resumes, setResumes] = useState<ResumeFamily[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listResumes()
      .then(({ resumes: list }) => setResumes(list))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load resumes'));
  }, []);

  return (
    <div>
      <PageHeader
        eyebrow="Versions"
        title="Resumes"
        description="Every fix, edit and restore creates a new version. History is never overwritten — restoring copies an old version forward and re-scores it."
        actions={<ButtonLink to="/analyze" variant="primary">New analysis</ButtonLink>}
      />
      {error && <Alert tone="bad">{error}</Alert>}
      {!resumes && !error && <Spinner />}
      {resumes && resumes.length === 0 && (
        <Card>
          <EmptyState icon={<FileStack className="size-5" />} title="No resumes yet" description="Upload a resume with a job description to create version 1." action={<ButtonLink to="/analyze" variant="primary">Analyze a resume</ButtonLink>} />
        </Card>
      )}
      <div className="space-y-6">
        {resumes?.map((resume) => (
          <ResumeCard key={resume.id} resume={resume} focused={params.get('focus') === resume.id} onRestored={(analysisId) => navigate(`/results/${analysisId}`)} />
        ))}
      </div>
    </div>
  );
};
