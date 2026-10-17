import type { BoardResponse } from '@kanbit/shared';
import { useState } from 'react';
import { errorMessage } from '../../lib/error-messages';
import { primaryButton, secondaryButton } from '../../shared/ui/buttons';
import type { Viewer } from '../board/board-model';
import { CloseSprintDialog } from './CloseSprintDialog';
import { useValidateAll } from './sprint.api';
import { formatSprintRange, pendingValidationCount, unfinishedCount } from './sprint-model';
import { StartSprintDialog } from './StartSprintDialog';

export interface SprintHeaderProps {
  board: BoardResponse;
  /** null = read-only (the teacher, or no session yet): information only. */
  viewer: Viewer | null;
  online: boolean;
}

const validatedNotice = (count: number): string =>
  count === 1 ? 'Se validó 1 tarjeta.' : `Se validaron ${count} tarjetas.`;

/** The board header's sprint block (spec §8.2): number, dates and goal, plus the moderator's sprint actions (§8.3). */
export function SprintHeader({ board, viewer, online }: SprintHeaderProps) {
  const isModerator = viewer?.isModerator === true;
  const teamId = board.team.id;
  const validateAll = useValidateAll(teamId);
  const [dialog, setDialog] = useState<'start' | 'close' | null>(null);
  const closeDialog = () => setDialog(null);
  const { sprint } = board;

  if (!sprint) {
    return (
      <div className="space-y-2">
        <p className="text-slate-600">Sin sprint abierto</p>
        {isModerator && (
          <button type="button" disabled={!online} onClick={() => setDialog('start')} className={primaryButton}>
            Iniciar sprint de la semana
          </button>
        )}
        {isModerator && dialog === 'start' && <StartSprintDialog teamId={teamId} online={online} onClose={closeDialog} />}
      </div>
    );
  }

  const pending = pendingValidationCount(board);

  return (
    <div className="space-y-2 text-slate-700">
      <div>
        <p className="font-semibold">
          Sprint {sprint.number} · {formatSprintRange(sprint)}
        </p>
        {sprint.goal && <p className="text-sm">Meta: {sprint.goal}</p>}
      </div>
      {isModerator && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!online || pending === 0 || validateAll.isPending}
              onClick={() => validateAll.mutate()}
              className={primaryButton}
            >
              {`Validar todas (${pending})`}
            </button>
            <button type="button" disabled={!online} onClick={() => setDialog('close')} className={secondaryButton}>
              Cerrar sprint
            </button>
          </div>
          {validateAll.isSuccess && (
            <p role="status" className="text-sm text-slate-700">
              {validatedNotice(validateAll.data.validatedIds.length)}
            </p>
          )}
          {validateAll.isError && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
              {errorMessage(validateAll.error)}
            </p>
          )}
          {dialog === 'close' && (
            <CloseSprintDialog teamId={teamId} sprint={sprint} unfinished={unfinishedCount(board)} onClose={closeDialog} />
          )}
        </>
      )}
    </div>
  );
}
