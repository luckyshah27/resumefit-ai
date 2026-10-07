import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FlaskConical, Play } from 'lucide-react';
import { getResearchDataset, listExperiments, runExperiment } from '../api/client';
import type { Experiment, ResearchDataset } from '../types';
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Spinner, Tabs, cx, formatDate } from '../components/ui';
import { CHART, ChartFrame, ChartTooltip, axisProps, type Series } from '../components/charts';

const pct = (value: number) => (value * 100).toFixed(1);
const MODE_LABEL = { direct: 'No threshold', 'fixed-threshold': 'Fixed threshold', 'cross-validated': 'Leave-one-job-out CV' } as const;

const SWEEP_SERIES: Series[] = [
  { key: 'tfidf', label: 'TF-IDF', color: CHART.series[0] },
  { key: 'embedding', label: 'Embeddings (MiniLM)', color: CHART.series[1] },
];

const Results = ({ experiment }: { experiment: Experiment }) => {
  const { results } = experiment;
  const errorMethods = Object.keys(results.errors);
  const [errorMethod, setErrorMethod] = useState(errorMethods[0] ?? '');

  // Headline comparison: one row per method (CV for thresholded methods).
  const headline = results.classification.filter((row) => row.mode !== 'fixed-threshold');
  const f1Data = headline.map((row) => ({ name: row.label.replace(/^[A-C]\. /, ''), f1: Number(pct(row.metrics.f1)) }));
  const sweep = useMemo(() => {
    const grid = results.thresholdSweep.tfidf ?? results.thresholdSweep.embedding ?? [];
    return grid.map((point, index) => ({
      threshold: point.threshold,
      tfidf: results.thresholdSweep.tfidf ? Number(pct(results.thresholdSweep.tfidf[index].f1)) : null,
      embedding: results.thresholdSweep.embedding ? Number(pct(results.thresholdSweep.embedding[index].f1)) : null,
    }));
  }, [results]);
  const sweepSeries = SWEEP_SERIES.filter((series) => results.thresholdSweep[series.key]);

  return (
    <div className="space-y-6">
      {results.unavailable.map((item) => (
        <Alert key={item.method} tone="warn" title={`${item.method} was not evaluated`}>
          {item.reason}
        </Alert>
      ))}

      <Card>
        <CardHeader
          eyebrow="Experiment 1"
          title="Requirement detection"
          description={`Does the resume satisfy each JD requirement? ${results.dataset.requirementExamples} labelled pairs (${results.dataset.positives} positive). Precision, recall and F1 in %.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-4">
                <th className="py-2 pl-5 pr-3 font-medium">Method</th>
                <th className="py-2 pr-3 font-medium">Threshold</th>
                <th className="py-2 pr-3 text-right font-medium">Precision</th>
                <th className="py-2 pr-3 text-right font-medium">Recall</th>
                <th className="py-2 pr-3 text-right font-medium">F1</th>
                <th className="py-2 pr-3 text-right font-medium">F1 95% CI</th>
                <th className="py-2 pr-3 text-right font-medium">Mandatory F1</th>
                <th className="py-2 pr-5 text-right font-medium">Preferred F1</th>
              </tr>
            </thead>
            <tbody>
              {results.classification.map((row) => (
                <tr key={`${row.method}-${row.mode}`} className={cx('border-b border-line last:border-0', row.mode === 'fixed-threshold' && 'text-ink-3')}>
                  <td className="py-2 pl-5 pr-3">
                    <div className="font-medium text-ink">{row.label}</div>
                    <div className="text-xs text-ink-4">{MODE_LABEL[row.mode]}</div>
                  </td>
                  <td className="num py-2 pr-3 text-ink-3">
                    {typeof row.thresholds === 'number' ? row.thresholds.toFixed(2) : row.thresholds ? [...new Set([Math.min(...Object.values(row.thresholds)), Math.max(...Object.values(row.thresholds))].map((value) => value.toFixed(2)))].join('–') : '—'}
                  </td>
                  <td className="num py-2 pr-3 text-right">{pct(row.metrics.precision)}</td>
                  <td className="num py-2 pr-3 text-right">{pct(row.metrics.recall)}</td>
                  <td className="num py-2 pr-3 text-right font-semibold text-ink">{pct(row.metrics.f1)}</td>
                  <td className="num py-2 pr-3 text-right text-ink-3">
                    {pct(row.f1Ci95.low)}–{pct(row.f1Ci95.high)}
                  </td>
                  <td className="num py-2 pr-3 text-right">{pct(row.byImportance.mandatory.f1)}</td>
                  <td className="num py-2 pr-5 text-right">{pct(row.byImportance.preferred.f1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame
          title="F1 by method"
          description="Thresholded methods use their cross-validated threshold."
          chart={
            <ResponsiveContainer width="100%" height={Math.max(160, f1Data.length * 44)}>
              <BarChart data={f1Data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 8 }}>
                <CartesianGrid horizontal={false} stroke={CHART.grid} />
                <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axisProps} />
                <YAxis type="category" dataKey="name" width={150} {...axisProps} axisLine={false} />
                <Tooltip content={<ChartTooltip valueFormatter={(value) => `${value.toFixed(1)}%`} />} cursor={{ fill: 'rgba(17,17,19,0.03)' }} />
                <Bar dataKey="f1" name="F1" fill={CHART.series[0]} barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  <LabelList dataKey="f1" position="right" fill="#3F3F46" fontSize={11} formatter={(value: number) => value.toFixed(1)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          }
          table={{ columns: ['Method', 'F1 %'], rows: f1Data.map((row) => [row.name, row.f1.toFixed(1)]) }}
        />
        {sweep.length > 0 && (
          <ChartFrame
            title="F1 across thresholds"
            description="Diagnostic sweep over the full dataset (not used for model selection)."
            series={sweepSeries}
            chart={
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={sweep} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="threshold" {...axisProps} tickFormatter={(value: number) => value.toFixed(2)} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axisProps} axisLine={false} />
                  <Tooltip content={<ChartTooltip labelFormatter={(label) => `Threshold ${Number(label).toFixed(2)}`} valueFormatter={(value) => `${value.toFixed(1)}%`} />} cursor={{ stroke: CHART.axis, strokeWidth: 1 }} />
                  {sweepSeries.map((series) => (
                    <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            }
            table={{ columns: ['Threshold', ...sweepSeries.map((series) => `${series.label} F1 %`)], rows: sweep.map((point) => [point.threshold.toFixed(2), ...sweepSeries.map((series) => (point[series.key as 'tfidf' | 'embedding'] ?? 0).toFixed(1))]) }}
          />
        )}
      </div>

      <Card>
        <CardHeader eyebrow="Experiment 2" title="Candidate ranking" description={`Each job ranks all ${results.dataset.resumes} resumes. nDCG uses graded relevance (0/1/2); P@2, MRR and MAP treat relevance 2 as relevant. Mean over ${results.dataset.jobs} jobs.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-4">
                <th className="py-2 pl-5 pr-3 font-medium">Method</th>
                {Object.keys(results.ranking[0]?.ndcg ?? {}).map((k) => (
                  <th key={k} className="py-2 pr-3 text-right font-medium">
                    nDCG{k}
                  </th>
                ))}
                <th className="py-2 pr-3 text-right font-medium">P@2</th>
                <th className="py-2 pr-3 text-right font-medium">MRR</th>
                <th className="py-2 pr-5 text-right font-medium">MAP</th>
              </tr>
            </thead>
            <tbody>
              {results.ranking.map((row) => (
                <tr key={row.method} className="border-b border-line last:border-0">
                  <td className="py-2 pl-5 pr-3 font-medium text-ink">{row.label}</td>
                  {Object.values(row.ndcg).map((value, index) => (
                    <td key={index} className="num py-2 pr-3 text-right">
                      {value.toFixed(3)}
                    </td>
                  ))}
                  <td className="num py-2 pr-3 text-right">{row.precisionAtK.toFixed(3)}</td>
                  <td className="num py-2 pr-3 text-right">{row.mrr.toFixed(3)}</td>
                  <td className="num py-2 pr-5 text-right">{row.map.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {errorMethods.length > 0 && (
        <Card>
          <CardHeader
            title="Error analysis"
            description="Misclassified requirement–resume pairs (first 25 per method)."
            action={<Tabs value={errorMethod} onChange={setErrorMethod} items={errorMethods.map((method) => ({ value: method, label: method, count: results.errors[method].length }))} />}
          />
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-4">
                  <th className="py-2 pl-5 pr-3 font-medium">Job</th>
                  <th className="py-2 pr-3 font-medium">Requirement</th>
                  <th className="py-2 pr-3 font-medium">Resume</th>
                  <th className="py-2 pr-3 font-medium">Error</th>
                  <th className="py-2 pr-5 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {(results.errors[errorMethod] ?? []).map((item, index) => (
                  <tr key={index} className="border-b border-line last:border-0">
                    <td className="py-1.5 pl-5 pr-3 text-ink-3">{item.jobId}</td>
                    <td className="py-1.5 pr-3 text-ink">{item.phrase}</td>
                    <td className="py-1.5 pr-3 text-ink-3">{item.resumeId}</td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={item.label ? 'warn' : 'bad'}>{item.label ? 'False negative' : 'False positive'}</Badge>
                    </td>
                    <td className="num py-1.5 pr-5 text-right text-ink-3">{item.score.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="eyebrow mb-2">Method notes</h3>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
          {results.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>Embedding model: {results.embeddingModel} (runs locally on CPU).</li>
        </ul>
      </Card>
    </div>
  );
};

export const ResearchPage = () => {
  const [dataset, setDataset] = useState<ResearchDataset | null>(null);
  const [experiments, setExperiments] = useState<Experiment[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getResearchDataset()
      .then(setDataset)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load dataset'));
    listExperiments()
      .then(({ experiments: list }) => {
        setExperiments(list);
        if (list[0]) setSelectedId(list[0]._id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load experiments'));
  }, []);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const experiment = await runExperiment({});
      setExperiments((current) => [experiment, ...(current ?? [])]);
      setSelectedId(experiment._id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Experiment failed');
    } finally {
      setRunning(false);
    }
  };

  const selected = experiments?.find((experiment) => experiment._id === selectedId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Research"
        title="Matching method evaluation"
        description="Compares keyword matching, TF-IDF similarity and sentence embeddings (plus this app's ontology engine) on a hand-labelled dataset. All numbers are computed when you run the experiment."
        actions={
          <Button variant="primary" icon={<Play className="size-4" />} loading={running} onClick={run}>
            {running ? 'Running experiment…' : 'Run experiment'}
          </Button>
        }
      />
      {running && <Alert>The first run loads the MiniLM embedding model (~23 MB) and may take up to a minute.</Alert>}
      {error && <Alert tone="bad">{error}</Alert>}

      {dataset && (
        <Card>
          <CardHeader eyebrow={`Dataset v${dataset.version}`} title="Evaluation dataset" description={dataset.description} />
          <div className="grid gap-6 p-5 md:grid-cols-[1fr_1.5fr]">
            <dl className="grid grid-cols-2 gap-4">
              {[
                ['Job descriptions', dataset.jobs.length],
                ['Resumes', dataset.resumes.length],
                ['Requirement labels', dataset.counts.requirementLabels],
                ['Positive labels', dataset.counts.positives],
                ['Relevance labels', dataset.counts.relevanceLabels],
                ['Requirements', dataset.jobs.reduce((total, job) => total + job.requirements.length, 0)],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-ink-3">{label}</dt>
                  <dd className="text-xl font-semibold tracking-[-0.02em] text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <h3 className="eyebrow mb-2">Labelling guidelines</h3>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-2">
                {dataset.labelingGuidelines.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {experiments && experiments.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-ink-3">Runs:</span>
          {experiments.map((experiment) => (
            <button
              key={experiment._id}
              type="button"
              onClick={() => setSelectedId(experiment._id)}
              className={cx('focus-ring rounded-md border px-2.5 py-1 text-xs', experiment._id === selectedId ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-2 hover:border-brand-200 hover:text-brand-700')}
            >
              {formatDate(experiment.createdAt, true)} · {(experiment.durationMs / 1000).toFixed(1)}s
            </button>
          ))}
        </div>
      )}

      {!experiments && !error && <Spinner />}
      {experiments && experiments.length === 0 && !running && (
        <Card>
          <EmptyState icon={<FlaskConical className="size-5" />} title="No experiment runs yet" description="Run the experiment to compute precision, recall, F1 and ranking metrics for every method." action={<Button variant="primary" onClick={run}>Run experiment</Button>} />
        </Card>
      )}
      {selected && <Results key={selected._id} experiment={selected} />}
    </div>
  );
};
