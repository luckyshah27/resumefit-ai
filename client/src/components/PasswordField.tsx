import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Field } from './ui';

export const PasswordField = ({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) => {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? 'Hide password' : 'Show password';

  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input pr-12"
        />
        <button
          type="button"
          className="focus-ring absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-canvas hover:text-ink"
          aria-label={toggleLabel}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </Field>
  );
};

const strengthChecks = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'Uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Number', test: (value: string) => /\d/.test(value) },
  { label: 'Special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

const strengthLabels = ['Weak', 'Fair', 'Strong', 'Very Strong'] as const;

export const PasswordStrength = ({ password }: { password: string }) => {
  if (!password) return null;
  const score = strengthChecks.filter(({ test }) => test(password)).length;
  const label = strengthLabels[score <= 2 ? 0 : score === 3 ? 1 : score === 4 ? 2 : 3];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-ink-3">Password strength</span>
        <span className="font-medium text-ink">{label}</span>
      </div>
      <div
        className="mt-1.5 flex gap-1"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={score}
        aria-valuetext={label}
      >
        {strengthChecks.map((check, index) => (
          <span
            key={check.label}
            className={`h-1.5 flex-1 rounded-full ${index < score ? 'bg-ink-2' : 'bg-line'}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {strengthChecks.map(({ label: checkLabel, test }) => (
          <li key={checkLabel} className={test(password) ? 'font-medium text-ink-2' : undefined}>
            {checkLabel}
          </li>
        ))}
      </ul>
    </div>
  );
};
