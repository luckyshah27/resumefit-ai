import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Loader2, Minus } from 'lucide-react';
import type { CheckStatus, MatchState } from '../types';

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-card hover:bg-brand-700 disabled:bg-ink-4',
  secondary: 'border border-line bg-white text-ink hover:bg-canvas hover:border-line-strong shadow-card',
  ghost: 'text-ink-2 hover:bg-brand-50 hover:text-brand-700',
  danger: 'border border-bad-line bg-white text-bad hover:bg-bad-bg',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode }>(
  ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx('focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-60', buttonStyles[variant], buttonSizes[size], className)}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export const ButtonLink = ({ to, variant = 'secondary', size = 'md', icon, className, children }: { to: string; variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; className?: string; children: ReactNode }) => (
  <Link to={to} className={cx('focus-ring inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium transition', buttonStyles[variant], buttonSizes[size], className)}>
    {icon}
    {children}
  </Link>
);

export const Card = ({ className, children, as: As = 'div', id }: { className?: string; children: ReactNode; as?: 'div' | 'section'; id?: string }) => (
  <As id={id} className={cx('rounded-lg border border-line bg-surface shadow-card', className)}>
    {children}
  </As>
);

export const CardHeader = ({ title, description, action, eyebrow }: { title: ReactNode; description?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
    <div className="min-w-0">
      {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
      <h2 className="text-[15px] font-semibold tracking-tightish text-ink">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
    </div>
    {action}
  </div>
);

export const PageHeader = ({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) => (
  <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-3">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad' | 'brand' | 'outline';
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-canvas text-ink-2 ring-1 ring-inset ring-line',
  good: 'bg-good-bg text-good ring-1 ring-inset ring-good-line',
  warn: 'bg-warn-bg text-warn ring-1 ring-inset ring-warn-line',
  bad: 'bg-bad-bg text-bad ring-1 ring-inset ring-bad-line',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100',
  outline: 'text-ink-2 ring-1 ring-inset ring-line',
};

export const Badge = ({ tone = 'neutral', children, className, icon }: { tone?: BadgeTone; children: ReactNode; className?: string; icon?: ReactNode }) => (
  <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-medium', badgeTones[tone], className)}>
    {icon}
    {children}
  </span>
);

export const MATCH_META: Record<MatchState, { label: string; tone: BadgeTone }> = {
  STRONG_MATCH: { label: 'Strong match', tone: 'good' },
  MATCH: { label: 'Match', tone: 'good' },
  PARTIAL_MATCH: { label: 'Transferable only', tone: 'warn' },
  WEAK_EVIDENCE: { label: 'Weak evidence', tone: 'warn' },
  MISSING: { label: 'Missing', tone: 'bad' },
};

export const MatchBadge = ({ state }: { state: MatchState }) => {
  const meta = MATCH_META[state];
  const Icon = meta.tone === 'good' ? CheckCircle2 : meta.tone === 'warn' ? AlertTriangle : AlertCircle;
  return (
    <Badge tone={meta.tone} icon={<Icon className="size-3" aria-hidden />}>
      {meta.label}
    </Badge>
  );
};

export const StatusDot = ({ status }: { status: CheckStatus }) => {
  const Icon = status === 'pass' ? CheckCircle2 : status === 'warn' ? AlertTriangle : AlertCircle;
  return <Icon aria-label={status} className={cx('size-4 shrink-0', status === 'pass' ? 'text-good' : status === 'warn' ? 'text-warn' : 'text-bad')} />;
};

export const scoreTone = (score: number) => (score >= 75 ? 'text-good' : score >= 55 ? 'text-warn' : 'text-bad');
export const scoreBand = (score: number) => (score >= 80 ? 'Strong' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'Needs work');

/** Circular gauge. Value text is ink; the arc carries the colour. */
export const ScoreRing = ({ value, size = 132, stroke = 8, label, sublabel, showValue = true }: { value: number; size?: number; stroke?: number; label?: string; sublabel?: string; showValue?: boolean }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const color = clamped >= 75 ? '#0F766E' : clamped >= 55 ? '#C78619' : '#D45A56';
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Score'} ${Math.round(clamped)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EFEEEA" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      {showValue && <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-semibold tracking-[-0.03em] text-ink" style={{ fontSize: size * 0.3 }}>
          {Math.round(clamped)}
        </span>
        {sublabel && <span className="text-2xs text-ink-3">{sublabel}</span>}
      </div>}
    </div>
  );
};

export const Meter = ({ value, max = 100, tone, className }: { value: number; max?: number; tone?: 'brand' | 'good' | 'warn' | 'bad' | 'auto'; className?: string }) => {
  const ratio = max === 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const resolved = tone === 'auto' || !tone ? (ratio >= 0.75 ? 'good' : ratio >= 0.45 ? 'warn' : 'bad') : tone;
  const color = { brand: 'bg-brand-500', good: 'bg-good', warn: 'bg-[#C78619]', bad: 'bg-[#D45A56]' }[resolved];
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-[#E8ECF4]', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-700', color)} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
};

export const Delta = ({ value, suffix = '', className }: { value: number | null; suffix?: string; className?: string }) => {
  if (value === null || Number.isNaN(value)) return <span className="text-ink-4">—</span>;
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0)
    return (
      <span className={cx('inline-flex items-center gap-0.5 text-ink-3', className)}>
        <Minus className="size-3.5" aria-hidden />0{suffix}
      </span>
    );
  const up = rounded > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-medium num', up ? 'text-good' : 'text-bad', className)}>
      <Icon className="size-3.5" aria-hidden />
      {up ? '+' : ''}
      {rounded}
      {suffix}
    </span>
  );
};

export const Alert = ({ tone = 'neutral', title, children, className }: { tone?: 'neutral' | 'bad' | 'warn' | 'good'; title?: ReactNode; children?: ReactNode; className?: string }) => {
  const styles = { neutral: 'border-line bg-canvas text-ink-2', bad: 'border-bad-line bg-bad-bg text-bad', warn: 'border-warn-line bg-warn-bg text-warn', good: 'border-good-line bg-good-bg text-good' }[tone];
  const Icon = tone === 'bad' ? AlertCircle : tone === 'warn' ? AlertTriangle : tone === 'good' ? CheckCircle2 : Info;
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex gap-2.5 rounded-md border px-3.5 py-3 text-[13px]', styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cx(Boolean(title) && 'mt-0.5', 'text-ink-2')}>{children}</div>}
      </div>
    </div>
  );
};

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-3" role="status">
    <Loader2 className="size-4 animate-spin" aria-hidden />
    {label}
  </div>
);

export const EmptyState = ({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-col items-center px-6 py-14 text-center">
    {icon && <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-line bg-canvas text-ink-3">{icon}</div>}
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Field = ({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) => (
  <div>
    <label className="label" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
    {error ? <p className="mt-1 text-xs text-bad">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
  </div>
);

export const Tabs = <T extends string>({ value, onChange, items, className }: { value: T; onChange: (value: T) => void; items: Array<{ value: T; label: ReactNode; count?: number }>; className?: string }) => (
  <div role="tablist" className={cx('inline-flex flex-wrap gap-0.5 rounded-md border border-line bg-canvas p-0.5', className)}>
    {items.map((item) => (
      <button
        key={item.value}
        role="tab"
        type="button"
        aria-selected={value === item.value}
        onClick={() => onChange(item.value)}
        className={cx('focus-ring inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[13px] font-medium transition', value === item.value ? 'bg-white text-ink shadow-card ring-1 ring-line' : 'text-ink-3 hover:text-ink')}
      >
        {item.label}
        {item.count !== undefined && <span className={cx('num rounded px-1 text-2xs', value === item.value ? 'bg-brand-50 text-brand-700' : 'text-ink-3')}>{item.count}</span>}
      </button>
    ))}
  </div>
);

export const Stat = ({ label, value, hint, delta }: { label: string; value: ReactNode; hint?: ReactNode; delta?: ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[13px] text-ink-3">{label}</div>
    <div className="mt-1 flex items-baseline gap-2">
      <span className="text-2xl font-semibold tracking-[-0.02em] text-ink">{value}</span>
      {delta}
    </div>
    {hint && <div className="mt-0.5 text-xs text-ink-4">{hint}</div>}
  </div>
);

export const Disclosure = ({ summary, children, defaultOpen = false }: { summary: (open: boolean) => ReactNode; children: ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="focus-ring w-full rounded text-left">
        {summary(open)}
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  );
};

export const formatDate = (value: string | Date | null | undefined, withTime = false) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
};

export const fmt = (value: number | null | undefined, digits = 0) => (value === null || value === undefined ? '—' : value.toFixed(digits));
