import type { BoardSprint } from '@kanbit/shared';
import { ConfirmDialog } from '../../shared/ui/Dialog';
import { useCloseSprint } from './sprint.api';

interface CloseSprintDialogProps {
  teamId: string;
  sprint: Pick<BoardSprint, 'id' | 'number'>;
  /** Unfinished cards of the sprint, counted from the board. */
  unfinished: number;
  onClose: () => void;
}

const returnNotice = (count: number): string =>
  count === 1
    ? '1 tarjeta sin terminar regresará al Backlog con su responsable; las terminadas se archivan con el sprint.'
    : `${count} tarjetas sin terminar regresarán al Backlog con su responsable; las terminadas se archivan con el sprint.`;

/** Simple close (v1.0): an in-app confirmation, then every unfinished card returns to the Backlog. */
export function CloseSprintDialog({ teamId, sprint, unfinished, onClose }: CloseSprintDialogProps) {
  const closeSprint = useCloseSprint(teamId);
  return (
    <ConfirmDialog
      title={`¿Cerrar el sprint ${sprint.number}?`}
      confirmLabel="Cerrar sprint"
      pendingLabel="Cerrando…"
      pending={closeSprint.isPending}
      error={closeSprint.error}
      onConfirm={() => closeSprint.mutate(sprint.id, { onSuccess: onClose })}
      onCancel={onClose}
    >
      <p>{returnNotice(unfinished)}</p>
    </ConfirmDialog>
  );
}
