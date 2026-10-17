import type { BoardResponse, CardResponse } from '@kanbit/shared';
import { describe, expect, it } from 'vitest';
import { boardFixture, cardFixture, MODERATOR_ID, OTHER_ID, STUDENT_ID } from '../../test/board-fixtures';
import { applyMove, resolveDrop } from './board-dnd';
import { viewerOf } from './board-model';

const STAMP = '2026-10-16T15:00:00.000Z';

describe('resolveDrop', () => {
  const board = boardFixture();
  const student = viewerOf(board, STUDENT_ID);
  const moderator = viewerOf(board, MODERATOR_ID);

  it('moves a card to the end of an allowed cell', () => {
    const decision = resolveDrop(board, student, 'cmine', { assigneeId: STUDENT_ID, status: 'DOING', overCardId: null });

    expect(decision).toEqual({
      kind: 'move',
      move: { cardId: 'cmine', status: 'DOING', assigneeId: STUDENT_ID, position: 'a0', expectedUpdatedAt: STAMP },
    });
  });

  it('reorders within a cell: dropping on an earlier card goes before it', () => {
    // Unassigned backlog is [cfree2 'a0', cfree1 'a1'].
    const decision = resolveDrop(board, student, 'cfree1', { assigneeId: null, status: 'BACKLOG', overCardId: 'cfree2' });

    expect(decision.kind).toBe('move');
    const position = decision.kind === 'move' ? decision.move.position : '';
    expect(position < 'a0').toBe(true);
  });

  it('reorders within a cell: dropping on a later card goes after it', () => {
    const decision = resolveDrop(board, student, 'cfree2', { assigneeId: null, status: 'BACKLOG', overCardId: 'cfree1' });

    expect(decision.kind === 'move' && decision.move.position > 'a1').toBe(true);
  });

  it('inserts before the card it is dropped on when coming from another cell', () => {
    const crowded = boardFixture({
      cards: [
        cardFixture({ id: 'cmine', status: 'TODO', assigneeId: STUDENT_ID, position: 'a0', dueWeekday: 'MON', doneCriteria: 'Listo' }),
        cardFixture({ id: 'cdoing1', status: 'DOING', assigneeId: STUDENT_ID, position: 'a0', dueWeekday: 'MON', doneCriteria: 'Listo' }),
        cardFixture({ id: 'cdoing2', status: 'DOING', assigneeId: STUDENT_ID, position: 'a1', dueWeekday: 'MON', doneCriteria: 'Listo' }),
      ],
    });

    const decision = resolveDrop(crowded, student, 'cmine', { assigneeId: STUDENT_ID, status: 'DOING', overCardId: 'cdoing2' });

    expect(decision.kind).toBe('move');
    const position = decision.kind === 'move' ? decision.move.position : '';
    expect(position > 'a0' && position < 'a1').toBe(true);
  });

  it('ignores a drop on the card itself or on its own place', () => {
    expect(resolveDrop(board, student, 'cmine', { assigneeId: STUDENT_ID, status: 'TODO', overCardId: 'cmine' })).toEqual({
      kind: 'none',
    });
    // cfree1 is already the last card of the unassigned backlog.
    expect(resolveDrop(board, student, 'cfree1', { assigneeId: null, status: 'BACKLOG', overCardId: null })).toEqual({
      kind: 'none',
    });
  });

  it('rejects targets outside the permission mirror', () => {
    expect(resolveDrop(board, student, 'cmine', { assigneeId: OTHER_ID, status: 'TODO', overCardId: null })).toEqual({
      kind: 'rejected',
    });
    expect(resolveDrop(board, student, 'cother', { assigneeId: STUDENT_ID, status: 'TODO', overCardId: null })).toEqual({
      kind: 'rejected',
    });
    expect(resolveDrop(board, null, 'cfree1', { assigneeId: null, status: 'BACKLOG', overCardId: 'cfree2' })).toEqual({
      kind: 'rejected',
    });
  });

  it('rejects the unassigned row outside the backlog, even for the moderator', () => {
    expect(resolveDrop(board, moderator, 'cother', { assigneeId: null, status: 'TODO', overCardId: null })).toEqual({
      kind: 'rejected',
    });
  });

  it("lets the moderator move another member's card into any row", () => {
    const decision = resolveDrop(board, moderator, 'cother', { assigneeId: STUDENT_ID, status: 'DONE', overCardId: null });

    expect(decision).toMatchObject({ kind: 'move', move: { cardId: 'cother', status: 'DONE', assigneeId: STUDENT_ID } });
  });

  it('asks for the missing day and criterion when an incomplete card leaves the backlog', () => {
    expect(resolveDrop(board, student, 'cfree1', { assigneeId: STUDENT_ID, status: 'TODO', overCardId: 'cmine' })).toEqual({
      kind: 'dialog',
      cardId: 'cfree1',
      target: { assigneeId: STUDENT_ID, status: 'TODO' },
    });
  });

  it('moves a complete backlog card out of the backlog directly', () => {
    const ready = boardFixture({
      cards: [cardFixture({ id: 'cready', assigneeId: STUDENT_ID, dueWeekday: 'FRI', doneCriteria: 'Demo lista' })],
    });

    const decision = resolveDrop(ready, viewerOf(ready, STUDENT_ID), 'cready', {
      assigneeId: STUDENT_ID,
      status: 'TODO',
      overCardId: null,
    });

    expect(decision).toMatchObject({ kind: 'move', move: { status: 'TODO', assigneeId: STUDENT_ID } });
  });
});

describe('applyMove', () => {
  const findCard = (board: BoardResponse, id: string): CardResponse | undefined =>
    board.cards.find((card) => card.id === id);

  it('returns a new board with the card in its target cell and leaves the original untouched', () => {
    const board = boardFixture();

    const moved = applyMove(board, {
      cardId: 'cfree1',
      status: 'TODO',
      assigneeId: STUDENT_ID,
      position: 'Zz',
      dueWeekday: 'MON',
      doneCriteria: 'Logo aprobado',
    });

    expect(findCard(moved, 'cfree1')).toMatchObject({
      status: 'TODO',
      assigneeId: STUDENT_ID,
      position: 'Zz',
      dueWeekday: 'MON',
      doneCriteria: 'Logo aprobado',
    });
    expect(findCard(board, 'cfree1')).toMatchObject({ status: 'BACKLOG', assigneeId: null, position: 'a1' });
    expect(findCard(moved, 'cmine')).toBe(findCard(board, 'cmine'));
  });

  it('keeps day and criterion when the move does not send them', () => {
    const moved = applyMove(boardFixture(), { cardId: 'cmine', status: 'DOING', assigneeId: STUDENT_ID, position: 'a5' });

    expect(findCard(moved, 'cmine')).toMatchObject({ status: 'DOING', dueWeekday: 'TUE', doneCriteria: 'El usuario inicia sesión' });
  });
});
