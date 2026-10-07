import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, UploadCloud, X } from 'lucide-react';
import { createAnalysis, listResumes } from '../api/client';
import { Alert, Button, Card, CardHeader, Field, PageHeader, Tabs, cx, formatDate } from '../components/ui';
import type { ResumeFamily } from '../types';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['pdf', 'docx'];

/** Synthetic demo job (same as samples/sample-job-description.txt). */
const EXAMPLE_JD = `Junior Backend Developer - Northwind Payments

About the role
Northwind Payments is hiring a Junior Backend Developer to build APIs for our fintech platform. Freshers and final-year students are welcome to apply.

Responsibilities
- Design and build REST APIs in Go for payment and settlement services
- Model data and write efficient queries in PostgreSQL
- Use Redis for caching and rate limiting
- Package and run services with Docker
- Write unit tests and take part in code reviews

Requirements
- 0-2 years of experience
- B.Tech/B.E. in Computer Science or a related field
- Go (Golang)
- REST API design
- PostgreSQL
- Redis
- Docker

Nice to have
- Kafka
- AWS`;

type Source = 'upload' | 'paste' | 'existing';

export const AnalysisPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [jobDescription, setJobDescription] = useState('');
  const [source, setSource] = useState<Source>(params.get('version') ? 'existing' : 'upload');
  const [file, setFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [title, setTitle] = useState('');
  const [resumes, setResumes] = useState<ResumeFamily[]>([]);
  const [versionId, setVersionId] = useState(params.get('version') ?? '');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listResumes()
      .then(({ resumes: list }) => {
        setResumes(list);
        if (!versionId && list[0]?.versions.length) setVersionId(list[0].versions[list[0].versions.length - 1].id);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFile = (candidate: File | undefined) => {
    setError('');
    if (!candidate) return;
    const extension = candidate.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED.includes(extension)) return setError('Upload a PDF or DOCX file.');
    if (candidate.size > MAX_BYTES) return setError('The file is larger than 5 MB.');
    if (candidate.size < 100) return setError('The file appears to be empty.');
    setFile(candidate);
  };

  const canSubmit = jobDescription.trim().length >= 80 && (source === 'upload' ? Boolean(file) : source === 'paste' ? resumeText.trim().length >= 50 : Boolean(versionId));

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const analysis = await createAnalysis({
        jobDescription,
        file: source === 'upload' ? file : null,
        resumeText: source === 'paste' ? resumeText : undefined,
        resumeVersionId: source === 'existing' ? versionId : undefined,
        title: title || undefined,
      });
      navigate(`/results/${analysis.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
      setLoading(false);
    }
  };

  const allVersions = resumes.flatMap((resume) => resume.versions.map((version) => ({ resume, version })));

  return (
    <div>
      <PageHeader eyebrow="New analysis" title="Analyze your resume against a job" description="Paste the job description and upload your resume. Every score is computed by a deterministic engine and explained requirement by requirement." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Job description"
            description="Paste the full posting — requirements, responsibilities and nice-to-haves."
            action={
              !jobDescription && (
                <Button size="sm" variant="ghost" onClick={() => setJobDescription(EXAMPLE_JD)}>
                  Use example
                </Button>
              )
            }
          />
          <div className="p-5">
            <label htmlFor="jd" className="sr-only">
              Job description
            </label>
            <textarea id="jd" value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} rows={18} placeholder="Paste the job description here…" className="input min-h-[360px] resize-y font-[450] leading-relaxed" />
            <div className="mt-2 flex justify-between text-xs text-ink-4">
              <span>{jobDescription.trim().length < 80 ? 'At least 80 characters' : 'Looks good'}</span>
              <span className="num">{jobDescription.length.toLocaleString()} chars</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Resume"
            action={
              <Tabs
                value={source}
                onChange={setSource}
                items={[
                  { value: 'upload', label: 'Upload' },
                  { value: 'paste', label: 'Paste text' },
                  ...(allVersions.length ? [{ value: 'existing' as Source, label: 'Saved version' }] : []),
                ]}
              />
            }
          />
          <div className="space-y-4 p-5">
            {source === 'upload' && (
              <>
                {file ? (
                  <div className="flex items-center gap-3 rounded-md border border-line bg-canvas px-4 py-3">
                    <FileText className="size-5 text-ink-3" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{file.name}</div>
                      <div className="text-xs text-ink-3">{(file.size / 1024).toFixed(0)} KB · {file.name.split('.').pop()?.toUpperCase()}</div>
                    </div>
                    <button type="button" onClick={() => setFile(null)} className="focus-ring rounded p-1 text-ink-3 hover:text-ink" aria-label="Remove file">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      pickFile(event.dataTransfer.files[0]);
                    }}
                    className={cx('focus-ring flex w-full flex-col items-center rounded-md border border-dashed px-6 py-14 text-center transition', dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-canvas hover:bg-white')}
                  >
                    <UploadCloud className="size-6 text-ink-3" aria-hidden />
                    <span className="mt-3 text-sm font-medium text-ink">Drop your resume here, or click to browse</span>
                    <span className="mt-1 text-xs text-ink-3">PDF or DOCX · up to 5 MB · text-based (not scanned)</span>
                  </button>
                )}
                <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => pickFile(event.target.files?.[0])} />
              </>
            )}
            {source === 'paste' && (
              <div>
                <label htmlFor="resumeText" className="sr-only">
                  Resume text
                </label>
                <textarea id="resumeText" rows={14} value={resumeText} onChange={(event) => setResumeText(event.target.value)} placeholder="Paste your resume text, keeping its section headings (Education, Skills, Projects…)" className="input min-h-[300px] resize-y font-mono text-[12.5px] leading-relaxed" />
                <p className="mt-2 text-xs text-ink-3">Pasted text skips file-format checks, so ATS Readiness cannot detect tables, columns or images.</p>
              </div>
            )}
            {source === 'existing' && (
              <Field label="Resume version" htmlFor="version" hint="Re-use a saved version to compare fit against a different job.">
                <select id="version" className="input" value={versionId} onChange={(event) => setVersionId(event.target.value)}>
                  {allVersions.map(({ resume, version }) => (
                    <option key={version.id} value={version.id}>
                      {resume.title} · v{version.versionNumber} · {version.label} · {formatDate(version.createdAt)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {source !== 'existing' && (
              <Field label="Name this resume" htmlFor="title" hint="Optional — helps you find versions later.">
                <input id="title" className="input" placeholder="e.g. Full-stack resume" value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
            )}
            {error && <Alert tone="bad">{error}</Alert>}
            <Button variant="primary" size="lg" className="w-full" disabled={!canSubmit} loading={loading} onClick={submit}>
              {loading ? 'Parsing and scoring…' : 'Analyze resume'}
            </Button>
            <p className="text-center text-xs text-ink-4">Your file is parsed on the server and stored as version 1 of this resume.</p>
          </div>
        </Card>
      </div>
    </div>
  );
};
