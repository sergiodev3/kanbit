import { useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { errorMessage } from '../../lib/error-messages';
import { primaryButton, secondaryButton } from '../ui/buttons';
import { ErrorSummary } from './FormParts';
import { TextField } from './TextField';

interface NameFormProps {
  id: string;
  label: string;
  /** Shared zod name schema (trimmed, 1..max). */
  schema: z.ZodType<string>;
  maxLength: number;
  /** Shown when the trimmed name is empty, e.g. "Escribe el nombre del grupo." */
  requiredMessage: string;
  submitLabel: string;
  pendingLabel: string;
  /** Resolves on success; a rejection is shown as the server error. */
  onSubmit: (name: string) => Promise<unknown>;
  initialValue?: string;
  /** Clears the field after a successful create. */
  resetOnSuccess?: boolean;
  onCancel?: () => void;
}

/** One-field form for creating or renaming a group, team or project. */
export function NameForm({
  id,
  label,
  schema,
  maxLength,
  requiredMessage,
  submitLabel,
  pendingLabel,
  onSubmit,
  initialValue = '',
  resetOnSuccess = false,
  onCancel,
}: NameFormProps) {
  const [value, setValue] = useState(initialValue);
  const [fieldError, setFieldError] = useState<string>();
  const [serverError, setServerError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big');
      setFieldError(tooLong ? `Usa como máximo ${maxLength} caracteres.` : requiredMessage);
      return;
    }
    setFieldError(undefined);
    setPending(true);
    try {
      await onSubmit(parsed.data);
      if (resetOnSuccess) setValue('');
    } catch (error) {
      setServerError(error);
    } finally {
      setPending(false);
    }
  };

  const summary = [...(fieldError ? [fieldError] : []), ...(serverError ? [errorMessage(serverError)] : [])];

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-3">
      <ErrorSummary messages={summary} />
      <TextField id={id} label={label} value={value} onChange={setValue} error={fieldError} maxLength={maxLength} required />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
