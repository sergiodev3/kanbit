import type { InputHTMLAttributes } from 'react';

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange' | 'className'> {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
}

/** Labelled input wired for screen readers: `aria-invalid` plus hint and error descriptions. */
export function TextField({ id, label, value, onChange, error, hint, ...inputProps }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-slate-600">
          {hint}
        </p>
      )}
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 ${
          error ? 'border-red-600' : 'border-slate-300'
        }`}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
