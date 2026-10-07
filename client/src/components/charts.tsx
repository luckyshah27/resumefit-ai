import { useState, type ReactNode } from 'react';
import type { TooltipProps } from 'recharts';
import { Card, Tabs } from './ui';

/** Chart colors use distinct indigo, teal, and amber hues with readable contrast on white. */
export const CHART = {
  series: ['#5969E8', '#0F9F8F', '#DB9238'],
  grid: '#E9EDF4',
  axis: '#CDD5E3',
  tick: '#667085',
  surface: '#FFFFFF',
};

export const axisProps = {
  tick: { fill: CHART.tick, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART.axis },
} as const;

export type Series = { key: string; label: string; color: string };

export const Legend = ({ series }: { series: Series[] }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
    {series.map((item) => (
      <li key={item.key} className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ background: item.color }} aria-hidden />
        {item.label}
      </li>
    ))}
  </ul>
);

export const ChartTooltip = ({ active, payload, label, labelFormatter, valueFormatter }: TooltipProps<number, string> & { valueFormatter?: (value: number) => string }) => {
  if (!active || !payload?.length) return null;
  const heading = labelFormatter ? labelFormatter(label, payload) : label;
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-pop">
      {heading !== undefined && heading !== '' && <div className="mb-1 max-w-[240px] font-medium text-ink">{heading as ReactNode}</div>}
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: entry.color }} aria-hidden />
            <span className="text-ink-3">{entry.name}</span>
            <span className="num ml-auto pl-3 font-medium text-ink">{typeof entry.value === 'number' ? (valueFormatter ? valueFormatter(entry.value) : entry.value) : entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Card wrapper with a chart/table toggle so no value is reachable only by hover. */
export const ChartFrame = ({
  title,
  description,
  series,
  chart,
  table,
}: {
  title: string;
  description?: string;
  series?: Series[];
  chart: ReactNode;
  table: { columns: string[]; rows: Array<Array<ReactNode>> };
}) => {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <Card className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tightish text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
        />
      </div>
      {view === 'chart' ? (
        <div className="px-3 pb-4 pt-3">
          {series && series.length > 1 && (
            <div className="mb-2 px-2">
              <Legend series={series} />
            </div>
          )}
          {chart}
        </div>
      ) : (
        <div className="max-h-[320px] overflow-auto px-5 pb-4 pt-3">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-4">
                {table.columns.map((column, index) => (
                  <th key={column} className={index ? 'py-1.5 text-right font-medium' : 'py-1.5 font-medium'}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line last:border-0">
                  {row.map((cell, index) => (
                    <td key={index} className={index ? 'num py-1.5 text-right text-ink' : 'py-1.5 text-ink-2'}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
