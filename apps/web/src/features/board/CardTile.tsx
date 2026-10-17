import type { CardDue, CardResponse, CardVisualState } from '@kanbit/shared';
import { UNASSIGNED_LABEL, WEEKDAY_LABELS } from './board-model';

interface CardTileProps {
  card: CardResponse;
  projectName: string;
  /** null when the card has no assignee. */
  assigneeName: string | null;
  /** From `cardVisualState` with the server's "today"; omitted = no state to show. */
  visualState?: CardVisualState;
  /** Omitted for the drag preview, which is a plain picture of the card. */
  onOpen?: (card: CardResponse) => void;
}

const tileClass = 'block w-full space-y-1 rounded-lg bg-white p-3 text-left ring-1';
/** "Por validar" (spec §7.3): a dashed border on top of the label, so the state never depends on color alone. */
const pendingClass = 'border-2 border-dashed border-slate-500';

/** Text labels with AA contrast on their tinted backgrounds; they are part of the tile's accessible name. */
const DUE_BADGES: Record<CardDue, { label: string; className: string }> = {
  TODAY: { label: 'Vence hoy', className: 'bg-amber-100 text-amber-900 ring-amber-600' },
  OVERDUE: { label: 'Atrasada', className: 'bg-red-100 text-red-800 ring-red-600' },
};

/** Id of the tile's title, which describes the card's drag handle. */
export const cardTitleId = (cardId: string): string => `card-title-${cardId}`;

/** One card on the board (spec §2.5); a button, so it opens the card dialog by click, Enter or Space. */
export function CardTile({ card, projectName, assigneeName, visualState, onOpen }: CardTileProps) {
  const content = { card, projectName, assigneeName, ...(visualState ? { visualState } : {}) };
  const stateClass = visualState?.pendingValidation ? pendingClass : '';
  if (!onOpen) {
    return (
      <div aria-hidden="true" className={`${tileClass} ${stateClass} cursor-grabbing shadow-lg ring-brand-600`}>
        <TileContent {...content} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(card)}
      className={`${tileClass} ${stateClass} shadow-sm ring-slate-200 hover:ring-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600`}
    >
      <TileContent {...content} titleId={cardTitleId(card.id)} />
    </button>
  );
}

function TileContent({
  card,
  projectName,
  assigneeName,
  visualState,
  titleId,
}: Omit<CardTileProps, 'onOpen'> & { titleId?: string }) {
  const due = visualState?.due ? DUE_BADGES[visualState.due] : null;
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
      {(visualState?.pendingValidation || due) && (
        <span className="flex flex-wrap gap-1 pt-1">
          {visualState?.pendingValidation && (
            <StateBadge className="bg-slate-100 text-slate-800 ring-slate-500">Por validar</StateBadge>
          )}
          {due && <StateBadge className={due.className}>{due.label}</StateBadge>}
        </span>
      )}
    </>
  );
}

function StateBadge({ className, children }: { className: string; children: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${className}`}>{children}</span>;
}
