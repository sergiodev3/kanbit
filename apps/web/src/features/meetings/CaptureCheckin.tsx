import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/error-messages';
import { cardClasses, ErrorSummary } from '../../shared/forms/FormParts';
import { orderedErrors, type FieldErrors } from '../../shared/forms/form-errors';
import { SelectField } from '../../shared/forms/SelectField';
import { primaryButton } from '../../shared/ui/buttons';
import { CheckinFields, checkinLengthErrors } from './CheckinForm';
import { useCaptureCheckin } from './meetings.api';
import { CHECKIN_FIELDS, changedCheckinTexts, checkinTextsOf, type CheckinField, type CheckinRow } from './meetings-model';
import { useVersionBase } from './useVersionBase';

const NO_CHANGES = 'No hay cambios que guardar.';

export interface CaptureCheckinProps {
  meetingId: string;
  /** The teammates the moderator may capture for (not the moderator, who has their own form), with their check-in. */
  rows: readonly CheckinRow[];
  online: boolean;
}

/** Plan B (spec §8.4): the moderator fills in a teammate's check-in, including one who has none yet. */
export function CaptureCheckin({ meetingId, rows, online }: CaptureCheckinProps) {
  const idPrefix = useId();
  const [userId, setUserId] = useState('');
  const row = rows.find(({ member }) => member.userId === userId);

  return (
    <section aria-labelledby={`${idPrefix}-title`} className={cardClasses}>
      <h2 id={`${idPrefix}-title`} className="text-lg font-bold">
        Capturar check-in de un integrante
      </h2>
      <SelectField
        id={`${idPrefix}-member`}
        label="Integrante"
        value={row ? userId : ''}
        options={[
          { value: '', label: 'Elige un integrante' },
          ...rows.map(({ member }) => ({ value: member.userId, label: member.name })),
        ]}
        onChange={setUserId}
        disabled={!online}
      />
      {row && (
        <CaptureForm key={row.member.userId} meetingId={meetingId} row={row} online={online} />
      )}
    </section>
  );
}

function CaptureForm({ meetingId, row, online }: { meetingId: string; row: CheckinRow; online: boolean }) {
  const idPrefix = useId();
  const capture = useCaptureCheckin(meetingId);
  const [values, setValues] = useState(() => checkinTextsOf(row.checkin));
  const [errors, setErrors] = useState<FieldErrors<CheckinField>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const { base, setBase, awaitFresh } = useVersionBase(row.checkin, (fresh) => setValues(checkinTextsOf(fresh)));
  const { name, userId } = row.member;

  const change = (next: typeof values) => {
    if (!capture.isPending) capture.reset();
    setNotice(null);
    setValues(next);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = checkinLengthErrors(values);
    setErrors(found);
    setNotice(null);
    if (Object.keys(found).length > 0) return;
    const changed = changedCheckinTexts(values, base);
    if (Object.keys(changed).length === 0) {
      setNotice(NO_CHANGES);
      return;
    }
    capture.mutate(
      { userId, ...changed, ...(base ? { expectedUpdatedAt: base.updatedAt } : {}) },
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
    ...(notice ? [notice] : []),
    ...(capture.isError ? [errorMessage(capture.error)] : []),
  ];

  return (
    <form noValidate onSubmit={submit} aria-label="Capturar check-in" className="space-y-3">
      <ErrorSummary messages={summary} />
      <fieldset disabled={!online} className="space-y-3">
        <CheckinFields idPrefix={idPrefix} values={values} errors={errors} onChange={change} />
      </fieldset>
      <button type="submit" disabled={!online || capture.isPending} className={primaryButton}>
        {capture.isPending ? 'Guardando…' : 'Guardar captura'}
      </button>
      {capture.isSuccess && (
        <p role="status" className="text-sm font-semibold text-slate-800">
          {`Check-in de ${name} guardado.`}
        </p>
      )}
    </form>
  );
}
