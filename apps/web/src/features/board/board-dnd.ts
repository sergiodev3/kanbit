import type { BoardResponse, MoveCardRequest } from '@kanbit/shared';
import { canMoveCard, cellCards, moveBlock, positionAt, type CardTarget, type MoveBlock, type Viewer } from './board-model';

/** Where a dragged card was dropped: a cell `(assigneeId, status)`, and the card it landed on, if any. */
export interface DropOver extends CardTarget {
  /** null = the empty part of the cell, i.e. its end. */
  overCardId: string | null;
}

export type BoardMove = MoveCardRequest & { cardId: string };

/** Why a drop is refused: the permission mirror, or one of the move gates (no open sprint, not validated). */
export type DropRejection = 'forbidden' | MoveBlock;

export type DropDecision =
  /** Nothing changes (dropped on itself or on its own place). */
  | { kind: 'none' }
  /** The client mirror of permissions and move rules forbids the target; no request is sent. */
  | { kind: 'rejected'; reason: DropRejection }
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
    return { kind: 'rejected', reason: 'forbidden' };
  }

  const cell = cellCards(board, target.assigneeId, target.status);
  const currentIndex = cell.findIndex((candidate) => candidate.id === card.id);
  const overIndex = over.overCardId === null ? -1 : cell.findIndex((candidate) => candidate.id === over.overCardId);
  const endIndex = currentIndex === -1 ? cell.length : cell.length - 1;
  const index = overIndex === -1 ? endIndex : overIndex;
  if (currentIndex !== -1 && index === currentIndex) return { kind: 'none' };
  // Same order as the API: permissions first, then the sprint and validation gates, before asking for missing fields.
  const block = moveBlock(card, board.sprint, target.status);
  if (block) return { kind: 'rejected', reason: block };

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

/**
 * The board as it will look once the move succeeds; the optimistic update of the board cache. Like the API, leaving
 * the Backlog (or a card without a sprint) attaches the open sprint, and going back to the Backlog drops the sprint
 * and the validation.
 */
export function applyMove(board: BoardResponse, move: BoardMove): BoardResponse {
  const toBacklog = move.status === 'BACKLOG';
  return {
    ...board,
    cards: board.cards.map((card) => {
      if (card.id !== move.cardId) return card;
      const needsSprint = card.status === 'BACKLOG' || card.sprintId === null;
      return {
        ...card,
        status: move.status,
        assigneeId: move.assigneeId,
        position: move.position,
        ...(move.dueWeekday ? { dueWeekday: move.dueWeekday } : {}),
        ...(move.doneCriteria ? { doneCriteria: move.doneCriteria } : {}),
        sprintId: toBacklog ? null : needsSprint ? (board.sprint?.id ?? null) : card.sprintId,
        validated: !toBacklog && card.validated,
        validatedById: toBacklog ? null : card.validatedById,
      };
    }),
  };
}
