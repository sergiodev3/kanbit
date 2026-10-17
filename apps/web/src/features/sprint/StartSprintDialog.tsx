import { SPRINT_GOAL_MAX_LENGTH, SprintGoal } from '@kanbit/shared';
import { useId, useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error-messages';
import { ErrorSummary } from '../../shared/forms/FormParts';
import { TextField } from '../../shared/forms/TextField';
import { primaryButton, secondaryButton } from '../../shared/ui/buttons';
import { Dialog } from '../../shared/ui/Dialog';
import { useStartSprint } from './sprint.api';

interface StartSprintDialogProps {
  teamId: string;
  online: boolean;
  onClose: () => void;
}

/**
 * "Iniciar sprint de la semana" (spec §7.2): only the goal is asked for. The server decides the dates (Monday to
 * Friday of the current week, or of the next one on weekends); the board header shows them once it reloads.
 */
export function StartSprintDialog({ teamId, online, onClose }: StartSprintDialogProps) {
  const inputId = useId();
  const startSprint = useStartSprint(teamId);
  const [goal, setGoal] = useState('');
  const [goalError, setGoalError] = useState<string | undefined>();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = SprintGoal.safeParse(goal);
    if (!parsed.success) {
      setGoalError(
        goal.trim() ? `La meta admite como máximo ${SPRINT_GOAL_MAX_LENGTH} caracteres.` : 'Escribe la meta del sprint.',
      );
      return;
    }
    setGoalError(undefined);
    startSprint.mutate({ goal: parsed.data }, { onSuccess: onClose });
  };

  const summary = [...(goalError ? [goalError] : []), ...(startSprint.isError ? [errorMessage(startSprint.error)] : [])];

  return (
    <Dialog title="Iniciar sprint de la semana" onClose={onClose}>
      {!online && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Sin conexión: no puedes iniciar el sprint.
        </p>
      )}
      <form noValidate onSubmit={submit} aria-label="Iniciar sprint de la semana" className="space-y-3">
        <ErrorSummary messages={summary} />
        <p className="text-sm text-slate-700">
          El sprint va de lunes a viernes de esta semana; si lo inicias en sábado o domingo, será la semana siguiente.
          Verás las fechas en el encabezado del tablero.
        </p>
        <TextField
          id={inputId}
          label="Meta del sprint"
          hint="Una frase con lo que el equipo quiere lograr esta semana."
          value={goal}
          onChange={setGoal}
          error={goalError}
          maxLength={SPRINT_GOAL_MAX_LENGTH}
          required
          disabled={!online}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={!online || startSprint.isPending} className={primaryButton}>
            {startSprint.isPending ? 'Iniciando…' : 'Iniciar sprint'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
