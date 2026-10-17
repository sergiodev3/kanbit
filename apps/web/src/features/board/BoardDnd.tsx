import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Over,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardResponse, CardResponse, CardStatus } from '@kanbit/shared';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { resolveDrop, type DropDecision } from './board-dnd';
import { canEditCard, type Viewer } from './board-model';
import { cardTitleId } from './CardTile';

/** What every droppable (a cell, or a card inside it) tells the drop resolver and the announcements. */
interface DropData {
  assigneeId: string | null;
  status: CardStatus;
  /** "Row · Column", read out while dragging. */
  label: string;
  /** The card this droppable is, or null for the cell itself. */
  cardId: string | null;
}

const isDropData = (value: unknown): value is DropData =>
  typeof value === 'object' && value !== null && 'status' in value && 'label' in value && 'cardId' in value;

const dropDataOf = (over: Over | null): DropData | null => {
  const data: unknown = over?.data.current;
  return isDropData(data) ? data : null;
};

const SCREEN_READER_INSTRUCTIONS =
  'Para tomar una tarjeta, presiona Espacio o Enter. Usa las flechas para llevarla a otra celda o posición, ' +
  'presiona Espacio o Enter para soltarla, o Escape para cancelar.';

/** Which cards the viewer may drag; read by every sortable card. */
const CanDragContext = createContext<(card: CardResponse) => boolean>(() => false);

interface BoardDndProps {
  board: BoardResponse;
  viewer: Viewer | null;
  /** false for the read-only teacher view and while offline: nothing is draggable. */
  enabled: boolean;
  renderPreview: (card: CardResponse) => ReactNode;
  onDraggingChange: (dragging: boolean) => void;
  onDecision: (decision: DropDecision) => void;
  children: ReactNode;
}

/**
 * Drag & drop for the board (spec §4.1): mouse (a short distance first, so a click still opens the card), touch
 * (a long press, so the page still scrolls) and keyboard. Announcements are in Spanish.
 */
export function BoardDnd({ board, viewer, enabled, renderPreview, onDraggingChange, onDecision, children }: BoardDndProps) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const cardById = (id: UniqueIdentifier) => board.cards.find((card) => card.id === id);
  const titleOf = (id: UniqueIdentifier) => `«${cardById(id)?.title ?? ''}»`;
  const canDrag = (card: CardResponse) => enabled && viewer !== null && canEditCard(viewer, card);

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste la tarjeta ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const target = dropDataOf(over);
      return target ? `${titleOf(active.id)} está sobre ${target.label}.` : `${titleOf(active.id)} no está sobre ninguna celda.`;
    },
    onDragEnd: ({ active, over }) => {
      const target = dropDataOf(over);
      return target ? `Soltaste ${titleOf(active.id)} en ${target.label}.` : `Soltaste ${titleOf(active.id)}.`;
    },
    onDragCancel: ({ active }) => `Se canceló el movimiento de ${titleOf(active.id)}.`,
  };

  const finish = () => {
    setActiveId(null);
    onDraggingChange(false);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id);
    onDraggingChange(true);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    finish();
    const target = dropDataOf(over);
    if (!target) return;
    onDecision(
      resolveDrop(board, viewer, String(active.id), {
        assigneeId: target.assigneeId,
        status: target.status,
        overCardId: target.cardId,
      }),
    );
  };

  const activeCard = activeId === null ? undefined : cardById(activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      <CanDragContext.Provider value={canDrag}>{children}</CanDragContext.Provider>
      <DragOverlay>{activeCard ? renderPreview(activeCard) : null}</DragOverlay>
    </DndContext>
  );
}

interface BoardCellProps {
  /** Assignee a card gets when dropped here (null = "Sin asignar"). */
  assigneeId: string | null;
  status: CardStatus;
  label: string;
  cards: readonly CardResponse[];
  renderCard: (card: CardResponse) => ReactNode;
}

/** One `(row, column)` cell: a drop target and a vertical sortable list of its cards. */
export function BoardCell({ assigneeId, status, label, cards, renderCard }: BoardCellProps) {
  const id = `cell:${assigneeId ?? ''}:${status}`;
  const { setNodeRef, isOver } = useDroppable({ id, data: { assigneeId, status, label, cardId: null } satisfies DropData });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={`h-full min-h-20 rounded-lg p-2 ${isOver ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-slate-100'}`}
    >
      <SortableContext id={id} items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
        {cards.length === 0 ? (
          <p className="sr-only">Sin tarjetas</p>
        ) : (
          <ul className="space-y-2">
            {cards.map((card) => (
              <SortableCard key={card.id} card={card} drop={{ assigneeId, status, label, cardId: card.id }}>
                {renderCard(card)}
              </SortableCard>
            ))}
          </ul>
        )}
      </SortableContext>
    </div>
  );
}

type Listeners = NonNullable<ReturnType<typeof useSortable>['listeners']>;

/**
 * A card list item. Mouse and touch drag the whole item; the keyboard drags from the handle, because Enter and Space
 * on the tile itself open the card dialog.
 */
function SortableCard({ card, drop, children }: { card: CardResponse; drop: DropData; children: ReactNode }) {
  const draggable = useContext(CanDragContext)(card);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: drop,
    // Cards that can't be dragged still mark drop positions for the others.
    disabled: { draggable: !draggable, droppable: false },
    attributes: { roleDescription: 'tarjeta arrastrable' },
  });
  const { onKeyDown, ...pointerListeners } = listeners ?? {};
  const keyboardListeners: Listeners = onKeyDown ? { onKeyDown } : {};

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex items-stretch gap-1 ${isDragging ? 'opacity-40' : ''} ${draggable ? 'select-none' : ''}`}
      {...(draggable ? pointerListeners : {})}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {draggable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...keyboardListeners}
          aria-label="Arrastrar tarjeta"
          aria-describedby={`${cardTitleId(card.id)} ${attributes['aria-describedby']}`}
          className="flex w-8 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-600 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
            <circle cx="7" cy="5" r="1.5" />
            <circle cx="13" cy="5" r="1.5" />
            <circle cx="7" cy="10" r="1.5" />
            <circle cx="13" cy="10" r="1.5" />
            <circle cx="7" cy="15" r="1.5" />
            <circle cx="13" cy="15" r="1.5" />
          </svg>
        </button>
      )}
    </li>
  );
}
