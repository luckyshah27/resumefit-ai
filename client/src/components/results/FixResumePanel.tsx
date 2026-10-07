import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import type { Analysis, FixSuggestion } from '../../types';
import { ApiError, aiRewrite, applyFixes, getHealth } from '../../api/client';
import { Alert, Badge, Button, Card, CardHeader, Tabs, cx } from '../ui';

type FixState = { selected: boolean; text: string; confirmed: boolean };
type Filter = 'all' | 'ready' | 'input';

const PLACEHOLDER = /\[[^\]]{2,120}\]/;

const impactTone = { high: 'bad', medium: 'warn', low: 'neutral' } as const;

const FixCard = ({
  fix,
  state,
  onChange,
  error,
  aiText,
}: {
  fix: FixSuggestion;
  state: FixState;
  onChange: (next: Partial<FixState>) => void;
  error?: { message: string; violations?: Array<{ type: string; value: string }> };
  aiText?: string;
}) => {
  const placeholders = PLACEHOLDER.test(state.text);
  const edited = state.text.trim() !== fix.suggestedText.trim();
  const needsConfirm = fix.requiresConfirmation || fix.requiresUserInput || Boolean(error?.violations?.length);
  return (
    <li className={cx('rounded-lg border bg-white transition', state.selected ? 'border-brand-200 ring-1 ring-brand-100' : 'border-line')}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <input
          id={`select-${fix.id}`}
          type="checkbox"
          checked={state.selected}
          onChange={(event) => onChange({ selected: event.target.checked })}
          className="mt-1 size-4 rounded border-line-strong accent-[#111113]"
          aria-label={`Select fix: ${fix.title}`}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={`select-${fix.id}`} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink">{fix.title}</span>
            <Badge tone={impactTone[fix.impact]}>{fix.impact} impact</Badge>
            {fix.requiresUserInput && <Badge tone="brand">Needs your input</Badge>}
            {fix.requiresConfirmation && <Badge tone="warn">Adds a new claim</Badge>}
            {fix.confidence && <Badge tone={fix.confidence === 'high' ? 'good' : 'outline'}>{fix.confidence} confidence</Badge>}
          </label>
          <div className="mt-0.5 text-xs text-ink-3">{fix.section}</div>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-3 pl-11 lg:grid-cols-2">
        <div>
          <div className="eyebrow mb-1">{fix.operation === 'replace' ? 'Current text' : 'Insert after'}</div>
          <div className="min-h-[3rem] whitespace-pre-wrap rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink-2">
            {fix.operation === 'replace' ? fix.currentText : fix.anchor}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1 flex items-center justify-between">
            <span>Suggested text{edited ? ' (edited)' : ''}</span>
            {edited && (
              <button type="button" className="text-2xs font-medium normal-case tracking-normal text-ink-3 hover:text-ink" onClick={() => onChange({ text: fix.suggestedText })}>
                Reset
              </button>
            )}
          </div>
          <textarea
            value={state.text}
            onChange={(event) => onChange({ text: event.target.value, selected: true })}
            rows={Math.min(6, Math.max(2, Math.ceil(state.text.length / 70)))}
            className={cx('input resize-y font-mono text-[12.5px] leading-relaxed', placeholders ? 'border-warn-line bg-warn-bg/40' : 'bg-good-bg/40')}
            aria-label={`Suggested text for ${fix.title}`}
          />
          {aiText && aiText !== state.text && (
            <div className="mt-2 rounded-md border border-brand-100 bg-brand-50/60 px-3 py-2 text-[12.5px]">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 font-medium text-brand-700">
                  <Sparkles className="size-3.5" aria-hidden /> AI wording (passed fact check)
                </span>
                <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => onChange({ text: aiText, selected: true })}>
                  Use this
                </button>
              </div>
              <div className="font-mono text-ink-2">{aiText}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-line px-4 py-3 pl-11 text-[13px]">
        <p className="text-ink-2">
          <span className="font-medium text-ink">Why: </span>
          {fix.why}
        </p>
        {fix.confidenceReason && (
          <p className="text-xs text-ink-3">
            <span className="font-medium text-ink-2">Confidence: </span>
            {fix.confidenceReason}
          </p>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-3">
          {fix.targetRequirement && (
            <span>
              Target: <span className="text-ink-2">{fix.targetRequirement}</span>
            </span>
          )}
          {fix.evidenceUsed.length > 0 && (
            <span className="min-w-0">
              Evidence used: <span className="text-ink-2">{fix.evidenceUsed.slice(0, 2).join(' · ')}</span>
            </span>
          )}
        </div>
        {fix.userPrompt && <Alert tone="warn">{fix.userPrompt}</Alert>}
        {placeholders && state.selected && <p className="text-xs text-warn">Replace every [bracketed] placeholder with true information before applying.</p>}
        {error && (
          <Alert tone="bad" title={error.message}>
            {error.violations?.length ? `Not found in your resume: ${error.violations.map((violation) => violation.value).join(', ')}` : null}
          </Alert>
        )}
        {needsConfirm && state.selected && (
          <label className="flex items-start gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={state.confirmed} onChange={(event) => onChange({ confirmed: event.target.checked })} className="mt-0.5 size-4 accent-[#111113]" />
            I confirm this text is true and I can back it up in an interview.
          </label>
        )}
      </div>
    </li>
  );
};

export const FixResumePanel = ({ analysis }: { analysis: Analysis }) => {
  const navigate = useNavigate();
  const fixes = analysis.report.fixes;
  const [states, setStates] = useState<Record<string, FixState>>(() =>
    Object.fromEntries(fixes.map((fix) => [fix.id, { selected: false, text: fix.suggestedText, confirmed: false }])),
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [errors, setErrors] = useState<Record<string, { message: string; violations?: Array<{ type: string; value: string }> }>>({});
  const [globalError, setGlobalError] = useState('');
  const [applying, setApplying] = useState(false);
  const [label, setLabel] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTexts, setAiTexts] = useState<Record<string, string>>({});
  const [aiNote, setAiNote] = useState('');

  useEffect(() => {
    getHealth()
      .then((health) => setAiEnabled(health.aiRewrite))
      .catch(() => undefined);
  }, []);

  const ready = fixes.filter((fix) => !fix.requiresUserInput && !fix.requiresConfirmation);
  const visible = useMemo(() => fixes.filter((fix) => (filter === 'all' ? true : filter === 'ready' ? ready.includes(fix) : !ready.includes(fix))), [fixes, filter, ready]);
  const selected = fixes.filter((fix) => states[fix.id]?.selected);

  const update = (id: string, next: Partial<FixState>) => setStates((current) => ({ ...current, [id]: { ...current[id], ...next } }));

  const loadAi = async () => {
    setAiLoading(true);
    setAiNote('');
    try {
      const result = await aiRewrite(analysis.id);
      const accepted = result.rewrites.filter((rewrite) => rewrite.accepted);
      setAiTexts(Object.fromEntries(accepted.map((rewrite) => [rewrite.fixId, rewrite.text])));
      const rejected = result.rewrites.length - accepted.length;
      setAiNote(`${accepted.length} AI rewording${accepted.length === 1 ? '' : 's'} passed the fact check${rejected ? `; ${rejected} rejected for adding facts not in your resume` : ''}.`);
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : 'AI rewriting failed');
    } finally {
      setAiLoading(false);
    }
  };

  const submit = async () => {
    setApplying(true);
    setErrors({});
    setGlobalError('');
    try {
      const result = await applyFixes(
        analysis.id,
        selected.map((fix) => {
          const state = states[fix.id];
          return { id: fix.id, finalText: state.text.trim() !== fix.suggestedText.trim() ? state.text : undefined, confirmed: state.confirmed || undefined };
        }),
        label || undefined,
      );
      navigate(`/results/${result.analysis.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const details = e.details as { errors?: Array<{ id: string; message: string; violations?: Array<{ type: string; value: string }> }> } | undefined;
        setErrors(Object.fromEntries((details?.errors ?? []).map((item) => [item.id, item])));
        setGlobalError('Some selected fixes need your attention before they can be applied.');
      } else {
        setGlobalError(e instanceof Error ? e.message : 'Could not apply fixes');
      }
      setApplying(false);
    }
  };

  return (
    <Card as="section" id="fix">
      <CardHeader
        title="Fix my resume"
        description="Suggestions improve wording using only facts already in your resume. Anything that adds a new claim needs your input and confirmation."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {aiEnabled && (
              <Button size="sm" icon={<Wand2 className="size-3.5" />} loading={aiLoading} onClick={loadAi}>
                AI wording
              </Button>
            )}
            <Button size="sm" onClick={() => ready.forEach((fix) => update(fix.id, { selected: true }))} disabled={!ready.length}>
              Select all ready ({ready.length})
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'All', count: fixes.length },
            { value: 'ready', label: 'Ready to apply', count: ready.length },
            { value: 'input', label: 'Needs your input', count: fixes.length - ready.length },
          ]}
        />
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          <ShieldCheck className="size-3.5 text-good" aria-hidden /> Fact-checked: no new skills, numbers or organisations
        </span>
      </div>
      {aiNote && <div className="border-b border-line px-5 py-2 text-xs text-ink-3">{aiNote}</div>}

      {visible.length ? (
        <ul className="space-y-3 p-5">
          {visible.map((fix) => (
            <FixCard key={fix.id} fix={fix} state={states[fix.id]} onChange={(next) => update(fix.id, next)} error={errors[fix.id]} aiText={aiTexts[fix.id]} />
          ))}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-ink-3">No suggestions in this group.</p>
      )}

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-b-lg border-t border-line bg-white/95 px-5 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[13px] text-ink-2">
          <span className="num font-semibold text-ink">{selected.length}</span> selected · applying creates a new resume version and re-scores it with the same engine
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="version-label" className="sr-only">
            Version label
          </label>
          <input id="version-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Version label (optional)" className="input h-9 w-48 py-1" />
          <Button variant="primary" disabled={!selected.length} loading={applying} onClick={submit}>
            Apply & re-score
          </Button>
        </div>
      </div>
      {globalError && (
        <div className="px-5 pb-4">
          <Alert tone="bad">{globalError}</Alert>
        </div>
      )}
    </Card>
  );
};
