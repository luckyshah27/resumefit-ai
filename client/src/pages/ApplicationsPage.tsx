import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseBusiness, Plus } from 'lucide-react';
import { createApplication, deleteApplication, listAnalyses, listApplications, updateApplication, type ApplicationInput } from '../api/client';
import type { AnalysisSummary, Application, ApplicationStatus } from '../types';
import { APPLICATION_STATUSES } from '../types';
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, Spinner, formatDate } from '../components/ui';
import { Modal } from '../components/Modal';
import { STATUS_LABEL } from '../components/results/SaveApplicationDialog';

const ApplicationForm = ({ initial, analyses, onSubmit, onDelete, submitting }: { initial?: Application; analyses: AnalysisSummary[]; onSubmit: (input: ApplicationInput) => void; onDelete?: () => void; submitting: boolean }) => {
  const [form, setForm] = useState<ApplicationInput>({
    company: initial?.company ?? '',
    role: initial?.role ?? '',
    status: initial?.status ?? 'SAVED',
    jobUrl: initial?.jobUrl ?? '',
    location: initial?.location ?? '',
    notes: initial?.notes ?? '',
    deadline: initial?.deadline ? initial.deadline.slice(0, 10) : '',
    analysisId: initial?.analysisId ?? '',
  });
  const set = (key: keyof ApplicationInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form
      id="application-form"
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '')) as ApplicationInput);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="f-company">
          <input id="f-company" required className="input" value={form.company} onChange={set('company')} />
        </Field>
        <Field label="Role" htmlFor="f-role">
          <input id="f-role" required className="input" value={form.role} onChange={set('role')} />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <select id="f-status" className="input" value={form.status} onChange={set('status')}>
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Deadline" htmlFor="f-deadline">
          <input id="f-deadline" type="date" className="input" value={form.deadline} onChange={set('deadline')} />
        </Field>
        <Field label="Location" htmlFor="f-location">
          <input id="f-location" className="input" value={form.location} onChange={set('location')} />
        </Field>
        <Field label="Posting URL" htmlFor="f-url">
          <input id="f-url" className="input" value={form.jobUrl} onChange={set('jobUrl')} />
        </Field>
      </div>
      <Field label="Linked analysis" htmlFor="f-analysis" hint="Links the job description, Job Fit score and resume version.">
        <select id="f-analysis" className="input" value={form.analysisId} onChange={set('analysisId')}>
          <option value="">Not linked</option>
          {analyses.map((analysis) => (
            <option key={analysis.id} value={analysis.id}>
              {analysis.jobTitle}
              {analysis.company ? ` · ${analysis.company}` : ''} · v{analysis.versionNumber} · Job Fit {analysis.scores.jobFit.toFixed(1)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" htmlFor="f-notes">
        <textarea id="f-notes" rows={3} className="input" value={form.notes} onChange={set('notes')} />
      </Field>
      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" loading={submitting}>
          {initial ? 'Save changes' : 'Add application'}
        </Button>
      </div>
    </form>
  );
};

export const ApplicationsPage = () => {
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Application | 'new' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () =>
    listApplications()
      .then(({ applications: list }) => setApplications(list))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load applications'));

  useEffect(() => {
    load();
    listAnalyses()
      .then(({ analyses: list }) => setAnalyses(list))
      .catch(() => undefined);
  }, []);

  const save = async (input: ApplicationInput) => {
    setSubmitting(true);
    setError('');
    try {
      if (editing === 'new') await createApplication(input);
      else if (editing) await updateApplication(editing.id, input);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (application: Application, status: ApplicationStatus) => {
    setApplications((current) => current?.map((item) => (item.id === application.id ? { ...item, status } : item)) ?? null);
    try {
      const updated = await updateApplication(application.id, { status });
      setApplications((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status');
      load();
    }
  };

  const remove = async (application: Application) => {
    if (!window.confirm(`Delete the ${application.company} application?`)) return;
    await deleteApplication(application.id).catch((e) => setError(e instanceof Error ? e.message : 'Could not delete'));
    setEditing(null);
    load();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Tracker"
        title="Applications"
        description="Track every application with the resume version and Job Fit score you applied with."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add application
          </Button>
        }
      />
      {error && <Alert tone="bad" className="mb-4">{error}</Alert>}
      {!applications && !error && <Spinner />}
      {applications && applications.length === 0 && (
        <Card>
          <EmptyState icon={<BriefcaseBusiness className="size-5" />} title="No applications yet" description="Save one from an analysis results page, or add it manually." action={<Button variant="primary" onClick={() => setEditing('new')}>Add application</Button>} />
        </Card>
      )}
      {applications && applications.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[1240px] grid-cols-7 gap-3">
            {APPLICATION_STATUSES.map((status) => {
              const column = applications.filter((application) => application.status === status);
              return (
                <section key={status} aria-label={STATUS_LABEL[status]} className="flex min-h-[200px] flex-col rounded-lg border border-line bg-brand-50/35">
                  <header className="flex items-center justify-between px-3 py-2.5">
                    <h2 className="text-[13px] font-semibold text-ink">{STATUS_LABEL[status]}</h2>
                    <span className="num text-xs text-ink-4">{column.length}</span>
                  </header>
                  <ul className="flex-1 space-y-2 px-2 pb-2">
                    {column.map((application) => (
                      <li key={application.id} className="rounded-md border border-line bg-white p-3 shadow-card">
                        <button type="button" onClick={() => setEditing(application)} className="focus-ring block w-full rounded text-left">
                          <div className="truncate text-[13px] font-semibold text-ink">{application.company}</div>
                          <div className="truncate text-xs text-ink-3">{application.role}</div>
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {application.jobFitScore !== null && <Badge tone="outline">Fit {application.jobFitScore.toFixed(0)}</Badge>}
                          {application.resumeVersionNumber !== null && <Badge tone="neutral">v{application.resumeVersionNumber}</Badge>}
                        </div>
                        <div className="mt-2 text-2xs text-ink-4">{application.appliedAt ? `Applied ${formatDate(application.appliedAt)}` : `Saved ${formatDate(application.createdAt)}`}</div>
                        <label className="sr-only" htmlFor={`status-${application.id}`}>
                          Status
                        </label>
                        <select id={`status-${application.id}`} value={application.status} onChange={(event) => changeStatus(application, event.target.value as ApplicationStatus)} className="input mt-2 h-7 py-0 text-xs">
                          {APPLICATION_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {STATUS_LABEL[value]}
                            </option>
                          ))}
                        </select>
                        {application.analysisId && (
                          <Link to={`/results/${application.analysisId}`} className="mt-2 block text-2xs font-medium text-ink-3 hover:text-ink">
                            View analysis →
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add application' : 'Edit application'}>
        {editing !== null && (
          <>
            <ApplicationForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} analyses={analyses} onSubmit={save} onDelete={editing === 'new' ? undefined : () => remove(editing)} submitting={submitting} />
            {editing !== 'new' && editing.statusHistory.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="eyebrow mb-2">History</h3>
                <ol className="space-y-1 text-xs text-ink-2">
                  {editing.statusHistory.map((entry, index) => (
                    <li key={index}>
                      {formatDate(entry.at, true)} — {STATUS_LABEL[entry.status]}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};
