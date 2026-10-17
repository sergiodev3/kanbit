import { CHECKIN_TEXT_MAX_LENGTH, type CheckinResponse } from '@kanbit/shared';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/error-messages';
import { newId } from '../../lib/ids';
import { cardClasses, ErrorSummary } from '../../shared/forms/FormParts';
import { orderedErrors, type FieldErrors } from '../../shared/forms/form-errors';
import { primaryButton } from '../../shared/ui/buttons';
import { useSaveMyCheckin } from './meetings.api';
import {
  CHECKIN_FIELDS,
  CHECKIN_QUESTIONS,
  checkinTextsOf,
  type CheckinField,
  type CheckinTexts,
} from './meetings-model';
import { TextAreaField } from './TextAreaField';
import { useVersionBase } from './useVersionBase';

export const tooLongMessage = (field: CheckinField): string =>
  `${CHECKIN_QUESTIONS[field]} admite como máximo ${CHECKIN_TEXT_MAX_LENGTH} caracteres.`;

export function checkinLengthErrors(values: CheckinTexts): FieldErrors<CheckinField> {
  const errors: FieldErrors<CheckinField> = {};
  for (const field of CHECKIN_FIELDS) {
    if (values[field].trim().length > CHECKIN_TEXT_MAX_LENGTH) errors[field] = tooLongMessage(field);
  }
  return errors;
}

interface CheckinFieldsProps {
  idPrefix: string;
  values: CheckinTexts;
  errors: FieldErrors<CheckinField>;
  onChange: (values: CheckinTexts) => void;
}

/** The four daily questions (spec §5.3) as labelled textareas. */
export function CheckinFields({ idPrefix, values, errors, onChange }: CheckinFieldsProps) {
  return (
    <>
      {CHECKIN_FIELDS.map((field) => (
        <TextAreaField
          key={field}
          id={`${idPrefix}-${field}`}
          label={CHECKIN_QUESTIONS[field]}
          value={values[field]}
          onChange={(value) => onChange({ ...values, [field]: value })}
          error={errors[field]}
          maxLength={CHECKIN_TEXT_MAX_LENGTH}
        />
      ))}
    </>
  );
}

export interface CheckinFormProps {
  meetingId: string;
  /** The viewer's saved check-in, if any: prefills the form. */
  mine: CheckinResponse | null;
  online: boolean;
}

/**
 * "Mi check-in": the viewer's four answers. Saved with an idempotent PUT that always carries all four texts (it
 * replaces the whole check-in); the client id is generated once per form, so a retry re-sends it.
 */
export function CheckinForm({ meetingId, mine, online }: CheckinFormProps) {
  const idPrefix = useId();
  const save = useSaveMyCheckin(meetingId);
  const [freshId] = useState(newId);
  const [values, setValues] = useState(() => checkinTextsOf(mine));
  const [errors, setErrors] = useState<FieldErrors<CheckinField>>({});
  const { base, setBase, awaitFresh } = useVersionBase(mine, (fresh) => setValues(checkinTextsOf(fresh)));

  const change = (next: CheckinTexts) => {
    if (!save.isPending) save.reset();
    setValues(next);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = checkinLengthErrors(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(
      {
        id: base?.id ?? freshId,
        did: values.did.trim(),
        doing: values.doing.trim(),
        willDo: values.willDo.trim(),
        blockers: values.blockers.trim(),
        ...(base ? { expectedUpdatedAt: base.updatedAt } : {}),
      },
      {
        onSuccess: setBase,
        onError: (error) => {
          if (isApiError(error, 'CHECKIN_CONFLICT')) awaitFresh();
        },
      },
    );
  };

  const summary = [
    ...orderedErrors(errors, CHECKIN_FIELDS),
    ...(save.isError ? [errorMessage(save.error)] : []),
  ];

  return (
    <form noValidate onSubmit={submit} aria-label="Mi check-in" className={cardClasses}>
      <h2 className="text-lg font-bold">Mi check-in</h2>
      <ErrorSummary messages={summary} />
      <fieldset disabled={!online} className="space-y-3">
        <CheckinFields idPrefix={idPrefix} values={values} errors={errors} onChange={change} />
      </fieldset>
      <button type="submit" disabled={!online || save.isPending} className={primaryButton}>
        {save.isPending ? 'Guardando…' : 'Guardar check-in'}
      </button>
      {save.isSuccess && (
        <p role="status" className="text-sm font-semibold text-slate-800">
          Check-in guardado.
        </p>
      )}
    </form>
  );
}
