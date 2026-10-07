import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError, createVersion, getVersion, listVersions } from '../api/client';
import type { VersionDetail } from '../types';
import { Alert, Button, Card, CardHeader, Field, PageHeader, Spinner } from '../components/ui';

export const EditVersionPage = () => {
  const { resumeId = '' } = useParams();
  const navigate = useNavigate();
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [newClaims, setNewClaims] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    listVersions(resumeId)
      .then(async ({ resume, versions }) => {
        setTitle(resume.title);
        const latest = versions[0];
        if (!latest) throw new Error('This resume has no versions');
        const detail = await getVersion(latest.id);
        setVersion(detail);
        setText(detail.text);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load resume'));
  }, [resumeId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await createVersion(resumeId, { text, label: label || undefined, confirmed: confirmed || undefined });
      navigate(`/results/${result.analysis.id}`);
    } catch (e) {
      const details = e instanceof ApiError ? (e.details as { code?: string; violations?: Array<{ value: string }> } | undefined) : undefined;
      if (details?.code === 'CONFIRMATION_REQUIRED') {
        setNewClaims(details.violations?.map((violation) => violation.value) ?? []);
        setConfirmed(false);
      } else {
        setError(e instanceof Error ? e.message : 'Could not save version');
      }
      setSaving(false);
    }
  };

  if (error && !version) return <Alert tone="bad">{error}</Alert>;
  if (!version) return <Spinner label="Loading latest version" />;
  const changed = text !== version.text;

  return (
    <div className="space-y-6">
      <Link to="/resumes" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-3.5" /> All resumes
      </Link>
      <PageHeader eyebrow={title} title={`Edit version ${version.versionNumber}`} description="Make changes directly — for example, add a real project bullet or a missing section. Saving creates a new version and re-scores it against the same job description." />
      <Card>
        <CardHeader title="Resume text" description={`Scored against: ${version.job ? `${version.job.role}${version.job.company ? ` · ${version.job.company}` : ''}` : 'latest job description'}`} />
        <div className="space-y-4 p-5">
          <label htmlFor="resume-text" className="sr-only">
            Resume text
          </label>
          <textarea
            id="resume-text"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setNewClaims(null);
              setConfirmed(false);
            }}
            rows={28} className="input resize-y font-mono text-[12.5px] leading-relaxed" spellCheck />
          <Alert tone="warn">Only add information that is true. The scores reward evidence you can defend in an interview.</Alert>
          {newClaims && (
            <Alert tone="warn" title="Your edit adds new claims">
              <p>Not found in the previous version: {newClaims.join(', ') || 'new facts'}. Saving requires your confirmation that these are true.</p>
              <label className="mt-2 flex items-start gap-2 text-ink-2">
                <input type="checkbox" className="mt-0.5 size-4 accent-[#111113]" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                I confirm these additions are true and I can back them up in an interview.
              </label>
            </Alert>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="sm:w-72">
              <Field label="Version label" htmlFor="label">
                <input id="label" className="input" placeholder="e.g. Added PostgreSQL project bullet" value={label} onChange={(event) => setLabel(event.target.value)} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={!changed} onClick={() => setText(version.text)}>
                Discard changes
              </Button>
              <Button variant="primary" disabled={!changed || (newClaims !== null && !confirmed)} loading={saving} onClick={save}>
                Save as new version & re-score
              </Button>
            </div>
          </div>
          {error && <Alert tone="bad">{error}</Alert>}
        </div>
      </Card>
    </div>
  );
};
