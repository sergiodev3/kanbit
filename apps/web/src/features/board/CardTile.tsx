import type { CardResponse } from '@kanbit/shared';
import { UNASSIGNED_LABEL, WEEKDAY_LABELS } from './board-model';

interface CardTileProps {
  card: CardResponse;
  projectName: string;
  /** null when the card has no assignee. */
  assigneeName: string | null;
  onOpen: (card: CardResponse) => void;
}

/** One card on the board (spec §2.5); a button, so it opens the card dialog by click, Enter or Space. */
export function CardTile({ card, projectName, assigneeName, onOpen }: CardTileProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className="block w-full space-y-1 rounded-lg bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 hover:ring-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
    >
      <span className="block text-xs font-semibold text-brand-700">{projectName}</span>
      <span data-card-title className="block break-words font-semibold text-slate-900">
        {card.title}
      </span>
      {card.doneCriteria && (
        <span className="block break-words text-sm text-slate-600">
          <span className="sr-only">Criterio de terminado: </span>
          {card.doneCriteria}
        </span>
      )}
      <span className="flex flex-wrap gap-x-3 text-xs text-slate-600">
        {card.dueWeekday && (
          <span>
            <span className="sr-only">Día estimado: </span>
            {WEEKDAY_LABELS[card.dueWeekday]}
          </span>
        )}
        <span>
          <span className="sr-only">Responsable: </span>
          {assigneeName ?? UNASSIGNED_LABEL}
        </span>
      </span>
    </button>
  );
}
