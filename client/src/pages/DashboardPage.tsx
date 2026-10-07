import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, FileSearch } from 'lucide-react';
import { getAnalytics } from '../api/client';
import type { Analytics } from '../types';
import { useAuth } from '../context/AuthContext';
import { Alert, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Spinner, fmt, formatDate } from '../components/ui';
import { CHART, ChartFrame, ChartTooltip, axisProps, type Series } from '../components/charts';
import { STATUS_LABEL } from '../components/results/SaveApplicationDialog';

const TREND_SERIES: Series[] = [
  { key: 'jobFit', label: 'Job Fit', color: CHART.series[0] },
  { key: 'atsReadiness', label: 'ATS Readiness', color: CHART.series[1] },
  { key: 'resumeQuality', label: 'Resume Quality', color: CHART.series[2] },
];

const BAND_SERIES: Series[] = [
  { key: 'applications', label: 'Applications', color: CHART.series[0] },
  { key: 'interviews', label: 'Reached interview', color: CHART.series[1] },
];

const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-[22px] border border-line bg-gradient-to-br from-white via-white to-brand-50/50 px-4 py-4 shadow-[0_12px_30px_rgba(45,62,120,0.06)]">
    <div className="text-[10px] uppercase tracking-[0.18em] text-brand-700">{label}</div>
    <div className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-ink">{value}</div>
    {hint && <div className="mt-1 text-[11px] text-ink-4">{hint}</div>}
  </div>
);

export const DashboardPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load analytics'));
  }, []);

  if (error) return <Alert tone="bad" title="Could not load your dashboard">{error}</Alert>;
  if (!data) return <Spinner label="Loading dashboard" />;

  const { totals } = data;
  const pct = (value: number | null) => (value === null ? '—' : `${fmt(value, 0)}%`);
  const trend = data.scoreTrend.map((point, index) => ({ ...point, index: index + 1 }));
  const statusData = data.byStatus.map((item) => ({ ...item, name: STATUS_LABEL[item.status] }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Welcome back${user ? `, ${user.name.split(' ')[0]}` : ''}`}
        title="Your placement-readiness overview."
        description="All figures are computed from your saved analyses and applications."
        actions={<ButtonLink to="/analyze" variant="primary">New analysis</ButtonLink>}
      />

      <section aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className="eyebrow mb-2">
          Application pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Applications" value={String(totals.applications)} hint={`${totals.submitted} submitted`} />
          <Kpi label="Interviews" value={String(totals.interviews)} />
          <Kpi label="Offers" value={String(totals.offers)} />
          <Kpi label="Rejections" value={String(totals.rejected)} />
          <Kpi label="Interview rate" value={pct(totals.interviewRate)} hint="of submitted" />
          <Kpi label="Selection rate" value={pct(totals.selectionRate)} hint="of submitted" />
        </div>
      </section>
      <section aria-labelledby="scores-heading">
        <h2 id="scores-heading" className="eyebrow mb-2">
          Resume scores
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi label="Average Job Fit" value={fmt(totals.averageJobFit, 1)} hint={`across ${totals.analyses} analyses`} />
          <Kpi label="Average Resume Quality" value={fmt(totals.averageResumeQuality, 1)} hint="latest version of each resume" />
          <Kpi label="Average ATS Readiness" value={fmt(totals.averageAtsReadiness, 1)} hint={`across ${totals.analyses} analyses`} />
        </div>
      </section>

      {totals.analyses === 0 ? (
        <Card>
          <EmptyState
            icon={<FileSearch className="size-5" />}
            title="Run your first analysis"
            description="Paste a job description and upload your resume to see Job Fit, ATS Readiness and Resume Quality — with every deduction explained."
            action={<ButtonLink to="/analyze" variant="primary">Analyze a resume</ButtonLink>}
          />
        </Card>
      ) : (
        <>
          <ChartFrame
            title="Scores over time"
            description="Each point is one analysis, in the order you ran them."
            series={TREND_SERIES}
            chart={
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="index" {...axisProps} tickFormatter={(value) => `#${value}`} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...axisProps} axisLine={false} />
                  <Tooltip content={<ChartTooltip labelFormatter={(_, payload) => (payload?.[0]?.payload as { label?: string; date?: string })?.label ?? ''} valueFormatter={(value) => value.toFixed(1)} />} cursor={{ stroke: CHART.axis, strokeWidth: 1 }} />
                  {TREND_SERIES.map((series) => (
                    <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={{ r: 4, fill: series.color, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 5, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            }
            table={{
              columns: ['Analysis', 'Job Fit', 'ATS', 'Quality'],
              rows: trend.map((point) => [`#${point.index} ${point.label}`, point.jobFit.toFixed(1), point.atsReadiness.toFixed(1), point.resumeQuality.toFixed(1)]),
            }}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartFrame
              title="Applications by status"
              chart={
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={statusData} margin={{ top: 20, right: 8, bottom: 4, left: -24 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="name" {...axisProps} interval={0} tickFormatter={(value: string) => (value.length > 10 ? `${value.slice(0, 9)}…` : value)} />
                    <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(17,17,19,0.03)' }} />
                    <Bar dataKey="count" name="Applications" fill={CHART.series[0]} barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey="count" position="top" fill="#3F3F46" fontSize={11} formatter={(value: number) => (value ? value : '')} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              }
              table={{ columns: ['Status', 'Applications'], rows: statusData.map((item) => [item.name, item.count]) }}
            />
            <ChartFrame
              title="Interviews by Job Fit band"
              description="Applications linked to an analysis, grouped by the Job Fit score they were sent with."
              series={BAND_SERIES}
              chart={
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.fitBands} margin={{ top: 8, right: 8, bottom: 4, left: -24 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis dataKey="band" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
                    <Tooltip content={<ChartTooltip labelFormatter={(label) => `Job Fit ${label}`} />} cursor={{ fill: 'rgba(17,17,19,0.03)' }} />
                    {BAND_SERIES.map((series) => (
                      <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} barSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              }
              table={{ columns: ['Job Fit band', 'Applications', 'Reached interview'], rows: data.fitBands.map((band) => [band.band, band.applications, band.interviews]) }}
            />
          </div>

          <Card>
            <CardHeader title="Recent analyses" action={<Link to="/resumes" className="text-[13px] font-medium text-ink-3 hover:text-ink">All versions →</Link>} />
            <ul className="divide-y divide-line">
              {data.recentAnalyses.map((analysis) => (
                <li key={analysis.id}>
                  <Link to={`/results/${analysis.id}`} className="focus-ring flex items-center gap-4 px-5 py-3 hover:bg-canvas/70">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">
                        {analysis.jobTitle}
                        {analysis.company && <span className="text-ink-3"> · {analysis.company}</span>}
                      </div>
                      <div className="text-xs text-ink-4">{formatDate(analysis.createdAt, true)}</div>
                    </div>
                    <dl className="hidden gap-6 text-right text-xs sm:flex">
                      {[
                        ['Job Fit', analysis.scores.jobFit],
                        ['ATS', analysis.scores.atsReadiness],
                        ['Quality', analysis.scores.resumeQuality],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <dt className="text-ink-4">{label}</dt>
                          <dd className="num text-sm font-medium text-ink">{(value as number).toFixed(1)}</dd>
                        </div>
                      ))}
                    </dl>
                    <ArrowRight className="size-4 text-ink-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
};
