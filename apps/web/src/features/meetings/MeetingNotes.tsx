import { MEETING_TEXT_MAX_LENGTH, type MeetingResponse } from '@kanbit/shared';
import { useId, useState, type FormEvent } from 'react';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/error-messages';
import { cardClasses, ErrorSummary } from '../../shared/forms/FormParts';
import { primaryButton } from '../../shared/ui/buttons';
import { useUpdateMeeting } from './meetings.api';
import { TextAreaField } from './TextAreaField';
import { useVersionBase } from './useVersionBase';

type NoteField = 'notesMd' | 'agreements';

const NOTE_FIELDS: readonly NoteField[] = ['notesMd', 'agreements'];

const LABELS: Record<NoteField, string> = { notesMd: 'Notas', agreements: 'Acuerdos' };
const EMPTY: Record<NoteField, string> = { notesMd: 'Sin notas.', agreements: 'Sin acuerdos.' };
const TOO_LONG: Record<NoteField, string> = {
  notesMd: `Las notas admiten como máximo ${MEETING_TEXT_MAX_LENGTH} caracteres.`,
  agreements: `Los acuerdos admiten como máximo ${MEETING_TEXT_MAX_LENGTH} caracteres.`,
};

export interface MeetingNotesProps {
  teamId: string;
  meeting: MeetingResponse;
  /** The moderator or the teacher; everyone else reads. */
  canEdit: boolean;
  online: boolean;
}

/** Notes and agreements of the meeting (spec §8.4): plain text, editable by the moderator and the teacher. */
export function MeetingNotes({ teamId, meeting, canEdit, online }: MeetingNotesProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cardClasses}>
      <h2 id={headingId} className="text-lg font-bold">
        Notas y acuerdos
      </h2>
      {canEdit ? (
        <NotesForm teamId={teamId} meeting={meeting} online={online} />
      ) : (
        <dl className="space-y-3 text-sm">
          {NOTE_FIELDS.map((field) => (
            <div key={field}>
              <dt className="font-semibold text-slate-800">{LABELS[field]}</dt>
              <dd className="whitespace-pre-wrap break-words text-slate-700">{meeting[field] ?? EMPTY[field]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const valuesOf = (meeting: MeetingResponse): Record<NoteField, string> => ({
  notesMd: meeting.notesMd ?? '',
  agreements: meeting.agreements ?? '',
});

const sameNotes = (a: MeetingResponse, b: MeetingResponse): boolean =>
  a.notesMd === b.notesMd && a.agreements === b.agreements;

function NotesForm({ teamId, meeting, online }: Omit<MeetingNotesProps, 'canEdit'>) {
  const idPrefix = useId();
  const update = useUpdateMeeting(teamId);
  const [values, setValues] = useState(() => valuesOf(meeting));
  const [errors, setErrors] = useState<Partial<Record<NoteField, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const { base, setBase, awaitFresh } = useVersionBase(meeting, (fresh) => setValues(valuesOf(fresh)), sameNotes);

  const change = (field: NoteField) => (value: string) => {
    if (!update.isPending) update.reset();
    setNotice(null);
    setValues({ ...values, [field]: value });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    const found: Partial<Record<NoteField, string>> = {};
    for (const field of NOTE_FIELDS) {
      if (values[field].length > MEETING_TEXT_MAX_LENGTH) found[field] = TOO_LONG[field];
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const original = valuesOf(base ?? meeting);
    const changed = NOTE_FIELDS.filter((field) => values[field] !== original[field]);
    if (changed.length === 0) {
      setNotice('No hay cambios que guardar.');
      return;
    }
    update.mutate(
      {
        meetingId: meeting.id,
        ...Object.fromEntries(changed.map((field) => [field, values[field]])),
        expectedUpdatedAt: (base ?? meeting).updatedAt,
      },
      {
        onSuccess: setBase,
        onError: (error) => {
          if (isApiError(error, 'MEETING_CONFLICT')) awaitFresh();
        },
      },
    );
  };

  const summary = [
    ...NOTE_FIELDS.flatMap((field) => errors[field] ?? []),
    ...(notice ? [notice] : []),
    ...(update.isError ? [errorMessage(update.error)] : []),
  ];

  return (
    <form noValidate onSubmit={submit} aria-label="Notas y acuerdos" className="space-y-3">
      <ErrorSummary messages={summary} />
      <fieldset disabled={!online} className="space-y-3">
        {NOTE_FIELDS.map((field) => (
          <TextAreaField
            key={field}
            id={`${idPrefix}-${field}`}
            label={LABELS[field]}
            value={values[field]}
            onChange={change(field)}
            error={errors[field]}
            rows={4}
          />
        ))}
      </fieldset>
      <button type="submit" disabled={!online || update.isPending} className={primaryButton}>
        {update.isPending ? 'Guardando…' : 'Guardar'}
      </button>
      {update.isSuccess && (
        <p role="status" className="text-sm font-semibold text-slate-800">
          Notas y acuerdos guardados.
        </p>
      )}
    </form>
  );
}
