import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookmarkPlus, History, MessagesSquare, Pencil } from 'lucide-react';
import { compareAnalyses, downloadReport, downloadResume, getAnalysis } from '../api/client';
import type { Analysis, AnalysisSummary, ReportComparison } from '../types';
import { Alert, Badge, Button, ButtonLink, Spinner, formatDate } from '../components/ui';
import { DownloadMenu } from '../components/DownloadMenu';
import { ScoreHero } from '../components/results/ScoreHero';
import { WhyPanel } from '../components/results/WhyPanel';
import { ComparisonPanel } from '../components/results/ComparisonPanel';
import { RequirementsPanel } from '../components/results/RequirementsPanel';
import { CostingPointsPanel } from '../components/results/CostingPointsPanel';
import { FixResumePanel } from '../components/results/FixResumePanel';
import { BreakdownPanel } from '../components/results/BreakdownPanel';
import { ProjectsPanel } from '../components/results/ProjectsPanel';
import { ParsedPanel } from '../components/results/ParsedPanel';
import { SaveApplicationDialog } from '../components/results/SaveApplicationDialog';

const SECTIONS = [
  { id: 'why', label: 'Why this score' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'costing', label: 'Costing points' },
  { id: 'fix', label: 'Fix resume' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'projects', label: 'Projects & profile' },
  { id: 'parsed', label: 'Extracted data' },
];

export const ResultsPage = () => {
  const { id = '' } = useParams();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [comparison, setComparison] = useState<{ before: AnalysisSummary; comparison: ReportComparison } | null>(null);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  // A new analysis (e.g. after "Apply & re-score") starts at the top so the before/after panel is visible.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setAnalysis(null);
    setComparison(null);
    setError('');
    getAnalysis(id)
      .then(async (result) => {
        if (cancelled) return;
        setAnalysis(result);
        if (result.previousAnalysisId) {
          const compared = await compareAnalyses(result.id, result.previousAnalysisId).catch(() => null);
          if (!cancelled && compared) setComparison({ before: compared.before, comparison: compared.comparison });
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load analysis'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error)
    return (
      <Alert tone="bad" title="Could not load this analysis">
        {error}{' '}
        <Link to="/dashboard" className="font-medium underline underline-offset-2">
          Back to dashboard
        </Link>
      </Alert>
    );
  if (!analysis) return <Spinner label="Loading analysis" />;

  const { report } = analysis;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="eyebrow mb-2">Analysis · {formatDate(analysis.createdAt, true)}</div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">
            {report.job.role}
            {report.job.company && <span className="text-ink-3"> · {report.job.company}</span>}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
            <Badge tone="outline">Resume v{analysis.versionNumber}</Badge>
            <span>{report.extraction.fileName ?? (report.extraction.fileType === 'text' ? 'Pasted / edited text' : '')}</span>
            <span>Engine {analysis.scoringVersion}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:shrink-0 lg:flex-nowrap">
          <ButtonLink to={`/results/${analysis.id}/interview`} icon={<MessagesSquare className="size-4" />}>
            Interview prep
          </ButtonLink>
          <ButtonLink to={`/resumes/${analysis.resumeId}/edit?from=${analysis.id}`} icon={<Pencil className="size-4" />}>
            Edit
          </ButtonLink>
          <ButtonLink to={`/resumes?focus=${analysis.resumeId}`} icon={<History className="size-4" />}>
            Versions
          </ButtonLink>
          <DownloadMenu
            onError={setDownloadError}
            items={[
              { label: 'Resume (DOCX)', description: `Version ${analysis.versionNumber}, exactly as analysed`, run: () => downloadResume(analysis.resumeVersionId, 'docx') },
              { label: 'Resume (PDF)', description: `Version ${analysis.versionNumber}, exactly as analysed`, run: () => downloadResume(analysis.resumeVersionId, 'pdf') },
              { label: 'Analysis report (PDF)', description: 'Scores, reasons, gaps and top fixes', run: () => downloadReport(analysis.id) },
            ]}
          />
          <Button variant="primary" icon={<BookmarkPlus className="size-4" />} onClick={() => setSaveOpen(true)}>
            Save application
          </Button>
        </div>
      </div>
      {downloadError && <Alert tone="bad">{downloadError}</Alert>}

      <ScoreHero analysis={analysis} comparison={comparison?.comparison ?? null} />

      {comparison && <ComparisonPanel comparison={comparison.comparison} before={comparison.before} current={analysis} />}

      <nav aria-label="Result sections" className="sticky top-14 z-20 -mx-4 overflow-x-auto border-b border-line bg-canvas/90 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <ul className="flex gap-1 py-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="focus-ring block whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] font-medium text-ink-3 hover:bg-brand-50 hover:text-brand-700">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <WhyPanel report={report} />
      <RequirementsPanel report={report} />
      <CostingPointsPanel report={report} />
      <FixResumePanel key={analysis.id} analysis={analysis} />
      <BreakdownPanel report={report} />
      <ProjectsPanel report={report} />
      <ParsedPanel report={report} />

      <div className="flex justify-center pt-2">
        <Link to="/analyze" className="text-[13px] font-medium text-ink-3 hover:text-ink">
          Analyze against another job →
        </Link>
      </div>

      <SaveApplicationDialog key={`save-${analysis.id}`} analysis={analysis} open={saveOpen} onClose={() => setSaveOpen(false)} />
    </div>
  );
};
