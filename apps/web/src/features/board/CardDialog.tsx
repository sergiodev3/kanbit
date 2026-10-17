import {
  CARD_TITLE_MAX_LENGTH,
  CardTitle,
  DONE_CRITERIA_MAX_LENGTH,
  DoneCriteria,
  Weekday,
  type BoardResponse,
  type CardResponse,
  type CardStatus,
} from '@kanbit/shared';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { isApiError } from '../../lib/api';
import { errorMessage } from '../../lib/error-messages';
import { newId } from '../../lib/ids';
import { ErrorSummary } from '../../shared/forms/FormParts';
import { orderedErrors, type FieldErrors } from '../../shared/forms/form-errors';
import { SelectField, type SelectOption } from '../../shared/forms/SelectField';
import { TextField } from '../../shared/forms/TextField';
import { dangerButton, primaryButton, secondaryButton } from '../../shared/ui/buttons';
import { ConfirmDialog, Dialog } from '../../shared/ui/Dialog';
import { useValidateCard } from '../sprint/sprint.api';
import { useCreateCard, useDeleteCard, useMoveCard, useUpdateCard } from './board.api';
import {
  BOARD_COLUMNS,
  canEditCard,
  cellCards,
  columnLabel,
  moveTargetRows,
  positionAtEnd,
  UNASSIGNED_LABEL,
  UNASSIGNED_ROW_ID,
  WEEKDAY_LABELS,
  type BoardRow,
  type CardTarget,
  type Viewer,
} from './board-model';

/** What every card dialog needs from the board page. */
export interface BoardContext {
  board: BoardResponse;
  /** All rows, unfiltered: move targets never depend on display filters. */
  rows: readonly BoardRow[];
  /** null = read-only (the teacher, or no session yet). */
  viewer: Viewer | null;
  online: boolean;
}

const OFFLINE_HINT = 'Sin conexión: no puedes crear, editar ni mover tarjetas.';

const WEEKDAY_OPTIONS: SelectOption[] = Weekday.options.map((day) => ({ value: day, label: WEEKDAY_LABELS[day] }));

// ---------------------------------------------------------------------------------------------------------------
// Card content fields (create and edit)

interface CardFieldValues {
  projectId: string;
  title: string;
  doneCriteria: string;
  /** '' = no day yet. */
  dueWeekday: string;
}

type CardField = keyof CardFieldValues;
const CARD_FIELD_ORDER: readonly CardField[] = ['projectId', 'title', 'doneCriteria', 'dueWeekday'];

const valuesOf = (card: CardResponse): CardFieldValues => ({
  projectId: card.projectId,
  title: card.title,
  doneCriteria: card.doneCriteria ?? '',
  dueWeekday: card.dueWeekday ?? '',
});

interface ParsedCardFields {
  projectId: string;
  title: string;
  doneCriteria: string | null;
  dueWeekday: Weekday | null;
}

function parseCardFields(values: CardFieldValues): { data?: ParsedCardFields; errors: FieldErrors<CardField> } {
  const errors: FieldErrors<CardField> = {};
  if (!values.projectId) errors.projectId = 'Elige un proyecto.';
  const title = CardTitle.safeParse(values.title);
  if (!title.success) {
    errors.title = values.title.trim() ? `La tarea admite como máximo ${CARD_TITLE_MAX_LENGTH} caracteres.` : 'Escribe la tarea.';
  }
  const doneCriteria = values.doneCriteria.trim();
  if (doneCriteria.length > DONE_CRITERIA_MAX_LENGTH) {
    errors.doneCriteria = `El criterio de terminado admite como máximo ${DONE_CRITERIA_MAX_LENGTH} caracteres.`;
  }
  const day = Weekday.safeParse(values.dueWeekday);
  if (!title.success || Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    data: {
      projectId: values.projectId,
      title: title.data,
      doneCriteria: doneCriteria || null,
      dueWeekday: day.success ? day.data : null,
    },
  };
}

interface CardFieldsProps {
  idPrefix: string;
  values: CardFieldValues;
  errors: FieldErrors<CardField>;
  projects: BoardResponse['projects'];
  onChange: (values: CardFieldValues) => void;
}

function CardFields({ idPrefix, values, errors, projects, onChange }: CardFieldsProps) {
  const set = (field: CardField) => (value: string) => onChange({ ...values, [field]: value });
  return (
    <>
      <SelectField
        id={`${idPrefix}-project`}
        label="Proyecto"
        value={values.projectId}
        options={projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={set('projectId')}
        error={errors.projectId}
        required
      />
      <TextField
        id={`${idPrefix}-title`}
        label="Tarea"
        value={values.title}
        onChange={set('title')}
        error={errors.title}
        maxLength={CARD_TITLE_MAX_LENGTH}
        required
      />
      <TextField
        id={`${idPrefix}-criteria`}
        label="Criterio de terminado (opcional en el Backlog)"
        hint="Una línea que diga cómo se sabe que está terminada."
        value={values.doneCriteria}
        onChange={set('doneCriteria')}
        error={errors.doneCriteria}
        maxLength={DONE_CRITERIA_MAX_LENGTH}
      />
      <SelectField
        id={`${idPrefix}-day`}
        label="Día estimado de entrega"
        value={values.dueWeekday}
        options={[{ value: '', label: 'Sin día' }, ...WEEKDAY_OPTIONS]}
        onChange={set('dueWeekday')}
        error={errors.dueWeekday}
      />
    </>
  );
}

function OfflineNotice({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
      {OFFLINE_HINT}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Create

/** "Nueva tarjeta": always lands in the unassigned Backlog; "Mover a" takes it into a row afterwards. */
export function CreateCardDialog({ context, onClose }: { context: BoardContext; onClose: () => void }) {
  const idPrefix = useId();
  const { board, online } = context;
  const createCard = useCreateCard(board.team.id);
  // One id per form: a retry after a network failure re-sends it and the API answers with the existing card.
  const [cardId] = useState(newId);
  const [values, setValues] = useState<CardFieldValues>({
    projectId: board.projects[0]?.id ?? '',
    title: '',
    doneCriteria: '',
    dueWeekday: '',
  });
  const [errors, setErrors] = useState<FieldErrors<CardField>>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseCardFields(values);
    setErrors(parsed.errors);
    if (!parsed.data) return;
    const { projectId, title, doneCriteria, dueWeekday } = parsed.data;
    createCard.mutate(
      {
        id: cardId,
        projectId,
        title,
        ...(doneCriteria ? { doneCriteria } : {}),
        ...(dueWeekday ? { dueWeekday } : {}),
      },
      { onSuccess: onClose },
    );
  };

  const summary = [
    ...orderedErrors(errors, CARD_FIELD_ORDER),
    ...(createCard.isError ? [errorMessage(createCard.error)] : []),
  ];

  return (
    <Dialog title="Nueva tarjeta" onClose={onClose}>
      <OfflineNotice online={online} />
      <form noValidate onSubmit={submit} aria-label="Nueva tarjeta" className="space-y-3">
        <ErrorSummary messages={summary} />
        <p className="text-sm text-slate-600">Se crea en el Backlog, sin responsable.</p>
        <fieldset disabled={!online} className="space-y-3">
          <CardFields idPrefix={idPrefix} values={values} errors={errors} projects={board.projects} onChange={setValues} />
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={!online || createCard.isPending} className={primaryButton}>
            {createCard.isPending ? 'Creando…' : 'Crear tarjeta'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Existing card: details, edit, move, delete

/**
 * The `updatedAt` a write sends as `expectedUpdatedAt`. It is the version the user started from; after a 409
 * `CARD_CONFLICT` the board reloads and, once the fresh card arrives, the form re-bases on it (`onRebase`).
 */
function useCardBase(card: CardResponse, onRebase: (fresh: CardResponse) => void) {
  const [base, setBase] = useState(card);
  const [awaitingFresh, setAwaitingFresh] = useState(false);
  if (awaitingFresh && card.updatedAt !== base.updatedAt) {
    setBase(card);
    setAwaitingFresh(false);
    onRebase(card);
  }
  return { base, awaitFresh: () => setAwaitingFresh(true) };
}

const isConflict = (error: unknown): boolean => isApiError(error, 'CARD_CONFLICT');

interface CardDialogProps {
  context: BoardContext;
  card: CardResponse;
  /** Set when a drag needs more data before the move: "Mover a" comes first, prefilled with the drop target. */
  moveTarget?: CardTarget;
  onClose: () => void;
}

export function CardDialog({ context, card, moveTarget, onClose }: CardDialogProps) {
  const { board, viewer, online } = context;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteCard = useDeleteCard(board.team.id);
  const editable = viewer !== null && canEditCard(viewer, card);
  const projectName = board.projects.find((project) => project.id === card.projectId)?.name ?? '';
  const assigneeName = board.members.find((member) => member.userId === card.assigneeId)?.name ?? UNASSIGNED_LABEL;
  const validation = validationLabel(card);
  const canValidate = viewer?.isModerator === true && card.status === 'TODO' && !card.validated;

  if (confirmingDelete) {
    return (
      <ConfirmDialog
        title="¿Eliminar la tarjeta?"
        confirmLabel="Eliminar"
        pendingLabel="Eliminando…"
        danger
        pending={deleteCard.isPending}
        error={deleteCard.error}
        onConfirm={() => deleteCard.mutate(card.id, { onSuccess: onClose })}
        onCancel={() => {
          deleteCard.reset();
          setConfirmingDelete(false);
        }}
      >
        <p>«{card.title}» se eliminará del Backlog. Esta acción no se puede deshacer.</p>
      </ConfirmDialog>
    );
  }

  return (
    <Dialog title={card.title} onClose={onClose}>
      <div className="max-h-[70dvh] space-y-4 overflow-y-auto">
        <p className="text-sm text-slate-600">
          {columnLabel(card.status)} · {assigneeName}
        </p>
        {validation && <p className="text-sm font-semibold text-slate-800">{validation}</p>}
        {canValidate && <ValidateCardSection context={context} card={card} onDone={onClose} />}
        {editable ? (
          <>
            <OfflineNotice online={online} />
            {moveTarget ? (
              <>
                <MoveCardForm context={context} card={card} initialTarget={moveTarget} onDone={onClose} />
                <EditCardForm context={context} card={card} onDone={onClose} />
              </>
            ) : (
              <>
                <EditCardForm context={context} card={card} onDone={onClose} />
                <MoveCardForm context={context} card={card} onDone={onClose} />
              </>
            )}
            {card.status === 'BACKLOG' && (
              <Section title="Eliminar">
                <button
                  type="button"
                  disabled={!online}
                  onClick={() => setConfirmingDelete(true)}
                  className={dangerButton}
                >
                  Eliminar tarjeta
                </button>
              </Section>
            )}
          </>
        ) : (
          <CardDetails card={card} projectName={projectName} assigneeName={assigneeName} />
        )}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cerrar
        </button>
      </div>
    </Dialog>
  );
}

/** Validation state outside the Backlog (spec §7.2): "Validada", or "Por validar" while waiting in Por hacer. */
function validationLabel(card: CardResponse): string | null {
  if (card.status === 'BACKLOG') return null;
  if (card.validated) return 'Validada';
  return card.status === 'TODO' ? 'Por validar' : null;
}

/** The moderator's "Validar" (spec §8.3); `expectedUpdatedAt` is the version on screen, refreshed by every reload. */
function ValidateCardSection({ context, card, onDone }: { context: BoardContext; card: CardResponse; onDone: () => void }) {
  const { board, online } = context;
  const validateCard = useValidateCard(board.team.id);
  return (
    <Section title="Validación">
      <ErrorSummary messages={validateCard.isError ? [errorMessage(validateCard.error)] : []} />
      <p className="text-sm text-slate-700">Una tarjeta validada puede pasar a En marcha y a Terminado.</p>
      <button
        type="button"
        disabled={!online || validateCard.isPending}
        onClick={() => validateCard.mutate({ cardId: card.id, expectedUpdatedAt: card.updatedAt }, { onSuccess: onDone })}
        className={primaryButton}
      >
        {validateCard.isPending ? 'Validando…' : 'Validar'}
      </button>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="space-y-3 border-t border-slate-200 pt-4">
      <h3 id={titleId} className="font-bold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CardDetails({ card, projectName, assigneeName }: { card: CardResponse; projectName: string; assigneeName: string }) {
  const rows: [string, string][] = [
    ['Proyecto', projectName],
    ['Criterio de terminado', card.doneCriteria ?? 'Sin definir'],
    ['Día estimado', card.dueWeekday ? WEEKDAY_LABELS[card.dueWeekday] : 'Sin día'],
    ['Responsable', assigneeName],
    ['Columna', columnLabel(card.status)],
  ];
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([term, detail]) => (
        <div key={term}>
          <dt className="font-semibold text-slate-800">{term}</dt>
          <dd className="break-words text-slate-700">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function EditCardForm({ context, card, onDone }: { context: BoardContext; card: CardResponse; onDone: () => void }) {
  const idPrefix = useId();
  const { board, online } = context;
  const updateCard = useUpdateCard(board.team.id);
  const [values, setValues] = useState(() => valuesOf(card));
  const [errors, setErrors] = useState<FieldErrors<CardField>>({});
  const { base, awaitFresh } = useCardBase(card, (fresh) => setValues(valuesOf(fresh)));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseCardFields(values);
    setErrors(parsed.errors);
    if (!parsed.data) return;
    updateCard.mutate(
      { cardId: card.id, ...parsed.data, expectedUpdatedAt: base.updatedAt },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (isConflict(error)) awaitFresh();
        },
      },
    );
  };

  const summary = [
    ...orderedErrors(errors, CARD_FIELD_ORDER),
    ...(updateCard.isError ? [errorMessage(updateCard.error)] : []),
  ];

  return (
    <form noValidate onSubmit={submit} aria-label="Editar tarjeta" className="space-y-3">
      <ErrorSummary messages={summary} />
      <fieldset disabled={!online} className="space-y-3">
        <CardFields idPrefix={idPrefix} values={values} errors={errors} projects={board.projects} onChange={setValues} />
      </fieldset>
      <button type="submit" disabled={!online || updateCard.isPending} className={primaryButton}>
        {updateCard.isPending ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </form>
  );
}

type MoveField = 'dueWeekday' | 'doneCriteria';
const MOVE_FIELD_ORDER: readonly MoveField[] = ['dueWeekday', 'doneCriteria'];

interface MoveCardFormProps {
  context: BoardContext;
  card: CardResponse;
  /** The cell a drag dropped the card on; defaults to the card's own cell. */
  initialTarget?: CardTarget;
  onDone: () => void;
}

/**
 * "Mover a" (keyboard and phone move path): target column and row limited by the client permission mirror; the
 * card goes to the end of the target cell. Outside the Backlog it needs a day and a done criterion (spec §2.5).
 */
function MoveCardForm({ context, card, initialTarget, onDone }: MoveCardFormProps) {
  const idPrefix = useId();
  const { board, rows, viewer, online } = context;
  const moveCard = useMoveCard(board.team.id);
  const [status, setStatus] = useState<CardStatus>(initialTarget?.status ?? card.status);
  const [rowId, setRowId] = useState(
    (initialTarget ? initialTarget.assigneeId : card.assigneeId) ?? UNASSIGNED_ROW_ID,
  );
  const [dueWeekday, setDueWeekday] = useState<string>(card.dueWeekday ?? '');
  const [doneCriteria, setDoneCriteria] = useState(card.doneCriteria ?? '');
  const [errors, setErrors] = useState<FieldErrors<MoveField>>({});
  const { base, awaitFresh } = useCardBase(card, (fresh) => {
    setDueWeekday(fresh.dueWeekday ?? '');
    setDoneCriteria(fresh.doneCriteria ?? '');
  });

  if (!viewer) return null;
  const columns = BOARD_COLUMNS.filter((column) => moveTargetRows(viewer, base, rows, column.status).length > 0);
  if (columns.length === 0) return null;
  const targets = moveTargetRows(viewer, base, rows, status);
  const target = targets.find((row) => row.id === rowId) ?? targets[0];
  const leavesBacklog = status !== 'BACKLOG';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;
    const nextErrors: FieldErrors<MoveField> = {};
    const day = Weekday.safeParse(dueWeekday);
    const criteria = DoneCriteria.safeParse(doneCriteria);
    if (leavesBacklog && !day.success) nextErrors.dueWeekday = 'Elige el día estimado.';
    if (leavesBacklog && !criteria.success) {
      nextErrors.doneCriteria =
        doneCriteria.trim().length > DONE_CRITERIA_MAX_LENGTH
          ? `El criterio de terminado admite como máximo ${DONE_CRITERIA_MAX_LENGTH} caracteres.`
          : 'Escribe el criterio de terminado.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    moveCard.mutate(
      {
        cardId: card.id,
        status,
        assigneeId: target.assigneeId,
        position: positionAtEnd(cellCards(board, target.assigneeId, status), card.id),
        ...(leavesBacklog && day.success && criteria.success
          ? { dueWeekday: day.data, doneCriteria: criteria.data }
          : {}),
        expectedUpdatedAt: base.updatedAt,
      },
      {
        onSuccess: onDone,
        onError: (error) => {
          if (isConflict(error)) awaitFresh();
        },
      },
    );
  };

  const summary = [
    ...orderedErrors(errors, MOVE_FIELD_ORDER),
    ...(moveCard.isError ? [errorMessage(moveCard.error)] : []),
  ];

  return (
    <Section title="Mover a">
      <form noValidate onSubmit={submit} aria-label="Mover a" className="space-y-3">
        <ErrorSummary messages={summary} />
        {initialTarget && (
          <p className="text-sm text-slate-700">
            Para moverla a «{columnLabel(initialTarget.status)}», completa el día estimado y el criterio de terminado.
          </p>
        )}
        <fieldset disabled={!online} className="space-y-3">
          <SelectField
            id={`${idPrefix}-status`}
            label="Columna"
            value={status}
            options={columns.map((column) => ({ value: column.status, label: column.label }))}
            onChange={(value) => setStatus(value as CardStatus)}
          />
          <SelectField
            id={`${idPrefix}-row`}
            label="Fila"
            value={target?.id ?? ''}
            options={targets.map((row) => ({ value: row.id, label: row.label }))}
            onChange={setRowId}
          />
          {leavesBacklog && (
            <>
              <SelectField
                id={`${idPrefix}-day`}
                label="Día estimado de entrega (obligatorio)"
                value={dueWeekday}
                options={[{ value: '', label: 'Elige un día' }, ...WEEKDAY_OPTIONS]}
                onChange={setDueWeekday}
                error={errors.dueWeekday}
                required
              />
              <TextField
                id={`${idPrefix}-criteria`}
                label="Criterio de terminado (obligatorio)"
                value={doneCriteria}
                onChange={setDoneCriteria}
                error={errors.doneCriteria}
                maxLength={DONE_CRITERIA_MAX_LENGTH}
                required
              />
            </>
          )}
        </fieldset>
        <button type="submit" disabled={!online || moveCard.isPending || !target} className={primaryButton}>
          {moveCard.isPending ? 'Moviendo…' : 'Mover'}
        </button>
      </form>
    </Section>
  );
}
