import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Analysis, ApplicationStatus } from '../../types';
import { APPLICATION_STATUSES } from '../../types';
import { createApplication } from '../../api/client';
import { Modal } from '../Modal';
import { Alert, Button, Field } from '../ui';

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  SAVED: 'Saved',
  APPLIED: 'Applied',
  OA: 'Online assessment',
  INTERVIEW: 'Interview',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export const SaveApplicationDialog = ({ analysis, open, onClose }: { analysis: Analysis; open: boolean; onClose: () => void }) => {
  const [company, setCompany] = useState(analysis.report.job.company ?? '');
  const [role, setRole] = useState(analysis.report.job.role === 'Unspecified role' ? '' : analysis.report.job.role);
  const [status, setStatus] = useState<ApplicationStatus>('SAVED');
  const [jobUrl, setJobUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await createApplication({ company, role, status, notes: notes || undefined, jobUrl: jobUrl || undefined, analysisId: analysis.id });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save application');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save to application tracker"
      footer={
        saved ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Link to="/applications" className="focus-ring inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-sm font-medium text-white hover:bg-ink-2">
              Open tracker
            </Link>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} disabled={!company.trim() || !role.trim()} onClick={save}>
              Save application
            </Button>
          </>
        )
      }
    >
      {saved ? (
        <Alert tone="good" title="Application saved">
          Linked to resume version {analysis.versionNumber} with a Job Fit of {analysis.scores.jobFit.toFixed(1)}.
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" htmlFor="app-company">
              <input id="app-company" className="input" value={company} onChange={(event) => setCompany(event.target.value)} />
            </Field>
            <Field label="Role" htmlFor="app-role">
              <input id="app-role" className="input" value={role} onChange={(event) => setRole(event.target.value)} />
            </Field>
          </div>
          <Field label="Status" htmlFor="app-status">
            <select id="app-status" className="input" value={status} onChange={(event) => setStatus(event.target.value as ApplicationStatus)}>
              {APPLICATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Job posting URL" htmlFor="app-url" hint="Optional">
            <input id="app-url" className="input" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="app-notes">
            <textarea id="app-notes" rows={3} className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <p className="text-xs text-ink-3">
            The job description, Job Fit score ({analysis.scores.jobFit.toFixed(1)}) and resume version (v{analysis.versionNumber}) are linked automatically.
          </p>
          {error && <Alert tone="bad">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
};
