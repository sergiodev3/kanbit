import type { BoardResponse, MoveCardRequest } from '@kanbit/shared';
import { canMoveCard, cellCards, positionAt, type CardTarget, type Viewer } from './board-model';

/** Where a dragged card was dropped: a cell `(assigneeId, status)`, and the card it landed on, if any. */
export interface DropOver extends CardTarget {
  /** null = the empty part of the cell, i.e. its end. */
  overCardId: string | null;
}

export type BoardMove = MoveCardRequest & { cardId: string };

export type DropDecision =
  /** Nothing changes (dropped on itself or on its own place). */
  | { kind: 'none' }
  /** The client permission mirror forbids the target; no request is sent. */
  | { kind: 'rejected' }
  /** The card leaves the Backlog without a day or criterion: the "Mover a" form collects them first. */
  | { kind: 'dialog'; cardId: string; target: CardTarget }
  | { kind: 'move'; move: BoardMove };

/**
 * Turns a drop into a decision. The position is computed from the exact, unfiltered server cell. Dropping on a card
 * of the same cell takes its place (the list order a sortable drag shows); dropping on a card of another cell inserts
 * before it; dropping on the cell itself appends.
 */
export function resolveDrop(
  board: BoardResponse,
  viewer: Viewer | null,
  cardId: string,
  over: DropOver,
): DropDecision {
  const card = board.cards.find((candidate) => candidate.id === cardId);
  if (!card || over.overCardId === cardId) return { kind: 'none' };
  const target: CardTarget = { assigneeId: over.assigneeId, status: over.status };
  // "Sin asignar" only exists in the Backlog (spec §2.4).
  if (!viewer || (target.assigneeId === null && target.status !== 'BACKLOG') || !canMoveCard(viewer, card, target)) {
    return { kind: 'rejected' };
  }

  const cell = cellCards(board, target.assigneeId, target.status);
  const currentIndex = cell.findIndex((candidate) => candidate.id === card.id);
  const overIndex = over.overCardId === null ? -1 : cell.findIndex((candidate) => candidate.id === over.overCardId);
  const endIndex = currentIndex === -1 ? cell.length : cell.length - 1;
  const index = overIndex === -1 ? endIndex : overIndex;
  if (currentIndex !== -1 && index === currentIndex) return { kind: 'none' };

  if (card.status === 'BACKLOG' && target.status !== 'BACKLOG' && (!card.dueWeekday || !card.doneCriteria)) {
    return { kind: 'dialog', cardId: card.id, target };
  }
  return {
    kind: 'move',
    move: {
      cardId: card.id,
      status: target.status,
      assigneeId: target.assigneeId,
      position: positionAt(cell, index, card.id),
      expectedUpdatedAt: card.updatedAt,
    },
  };
}

/** The board as it will look once the move succeeds; the optimistic update of the board cache. */
export function applyMove(board: BoardResponse, move: BoardMove): BoardResponse {
  return {
    ...board,
    cards: board.cards.map((card) =>
      card.id === move.cardId
        ? {
            ...card,
            status: move.status,
            assigneeId: move.assigneeId,
            position: move.position,
            ...(move.dueWeekday ? { dueWeekday: move.dueWeekday } : {}),
            ...(move.doneCriteria ? { doneCriteria: move.doneCriteria } : {}),
          }
        : card,
    ),
  };
}
