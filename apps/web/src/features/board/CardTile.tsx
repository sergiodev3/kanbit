import type { CardResponse } from '@kanbit/shared';
import { UNASSIGNED_LABEL, WEEKDAY_LABELS } from './board-model';

interface CardTileProps {
  card: CardResponse;
  projectName: string;
  /** null when the card has no assignee. */
  assigneeName: string | null;
  /** Omitted for the drag preview, which is a plain picture of the card. */
  onOpen?: (card: CardResponse) => void;
}

const tileClass = 'block w-full space-y-1 rounded-lg bg-white p-3 text-left ring-1';

/** Id of the tile's title, which describes the card's drag handle. */
export const cardTitleId = (cardId: string): string => `card-title-${cardId}`;

/** One card on the board (spec §2.5); a button, so it opens the card dialog by click, Enter or Space. */
export function CardTile({ card, projectName, assigneeName, onOpen }: CardTileProps) {
  if (!onOpen) {
    return (
      <div aria-hidden="true" className={`${tileClass} cursor-grabbing shadow-lg ring-brand-600`}>
        <TileContent card={card} projectName={projectName} assigneeName={assigneeName} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className={`${tileClass} shadow-sm ring-slate-200 hover:ring-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600`}
    >
      <TileContent card={card} projectName={projectName} assigneeName={assigneeName} titleId={cardTitleId(card.id)} />
    </button>
  );
}

function TileContent({
  card,
  projectName,
  assigneeName,
  titleId,
}: Omit<CardTileProps, 'onOpen'> & { titleId?: string }) {
  return (
    <>
      <span className="block text-xs font-semibold text-brand-700">{projectName}</span>
      <span id={titleId} data-card-title className="block break-words font-semibold text-slate-900">
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
    </>
  );
}
