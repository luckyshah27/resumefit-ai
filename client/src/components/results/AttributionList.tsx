import { useState } from 'react';
import type { Attribution } from '../../types';
import { Badge, Delta } from '../ui';

const VISIBLE = 2;

const AttributionItem = ({ item }: { item: Attribution }) => {
  const [expanded, setExpanded] = useState(false);
  const causes = expanded ? item.causes : item.causes.slice(0, VISIBLE);
  const hidden = item.causes.length - VISIBLE;
  return (
    <li className="rounded-md border border-line bg-white px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Badge tone="outline">{item.group}</Badge>
        <span className="font-medium text-ink">{item.target}</span>
        {item.delta !== null && <Delta value={item.delta} className="text-xs" />}
      </div>
      <ul className="mt-1.5 space-y-1 text-[13px]">
        {causes.map((cause, index) => (
          <li key={`${cause.changeId}-${index}`} className="min-w-0 truncate text-ink-2" title={cause.text || cause.why}>
            {cause.text ? (
              <>
                <span className="font-mono text-[12px] text-ink">“{cause.text}”</span>
                <span className="text-ink-3"> — {cause.why}</span>
              </>
            ) : (
              <span className="text-ink-3">{cause.why}</span>
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="focus-ring mt-1 rounded text-xs font-medium text-ink-3 hover:text-ink">
          {expanded ? 'Show less' : `+${hidden} more edit${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </li>
  );
};

/** Links each computed difference to the recorded edits that plausibly caused it (never invents deltas). */
export const AttributionList = ({ attribution }: { attribution: Attribution[] }) => {
  const meaningful = attribution.filter((item) => item.causes.length > 0);
  if (!meaningful.length) return null;
  return (
    <div className="min-w-0">
      <h3 className="eyebrow mb-1">What caused these changes</h3>
      <p className="mb-3 text-xs text-ink-3">Deltas are computed by re-scoring; links to edits are based on what each edit touched.</p>
      <ul className="space-y-2">
        {meaningful.map((item) => (
          <AttributionItem key={`${item.group}-${item.target}`} item={item} />
        ))}
      </ul>
    </div>
  );
};
