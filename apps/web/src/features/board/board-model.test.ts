import { describe, expect, it } from 'vitest';
import {
  boardFixture,
  cardFixture,
  MODERATOR_ID,
  OTHER_ID,
  sprintFixture,
  SPRINT_ID,
  STUDENT_ID,
} from '../../test/board-fixtures';
import {
  allowedStatuses,
  BOARD_COLUMNS,
  buildRows,
  canEditCard,
  canMoveCard,
  cellCards,
  moveTargetRows,
  onlyRowOf,
  positionAt,
  positionAtEnd,
  UNASSIGNED_ROW_ID,
  viewerOf,
} from './board-model';

const ids = (cards: readonly { id: string }[]) => cards.map((card) => card.id);

describe('board columns', () => {
  it('are the four fixed spec columns in order', () => {
    expect(BOARD_COLUMNS.map((column) => [column.status, column.label])).toEqual([
      ['BACKLOG', 'Backlog'],
      ['TODO', 'Por hacer'],
      ['DOING', 'En marcha'],
      ['DONE', 'Terminado'],
    ]);
  });
});

describe('buildRows', () => {
  it('puts the "Sin asignar" row first, then members by rowOrder', () => {
    const rows = buildRows(boardFixture());

    expect(rows.map((row) => [row.id, row.label])).toEqual([
      [UNASSIGNED_ROW_ID, 'Sin asignar'],
      [MODERATOR_ID, 'Ana López'],
      [STUDENT_ID, 'Luis Alumno'],
      [OTHER_ID, 'Carla Díaz'],
    ]);
    expect(rows[0]?.assigneeId).toBeNull();
    expect(rows[1]?.assigneeId).toBe(MODERATOR_ID);
  });

  it('places each card in its (row, column) cell', () => {
    const rows = buildRows(boardFixture());
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(ids(byId.get(UNASSIGNED_ROW_ID)?.cells.BACKLOG ?? [])).toEqual(['cfree2', 'cfree1']);
    expect(ids(byId.get(STUDENT_ID)?.cells.BACKLOG ?? [])).toEqual(['cmineb']);
    expect(ids(byId.get(STUDENT_ID)?.cells.TODO ?? [])).toEqual(['cmine']);
    expect(ids(byId.get(MODERATOR_ID)?.cells.DOING ?? [])).toEqual(['cmod']);
    expect(byId.get(OTHER_ID)?.cells.DONE).toEqual([]);
  });

  it('sorts a cell bytewise by position, then by id', () => {
    const board = boardFixture({
      cards: [
        cardFixture({ id: 'cb', position: 'a0' }),
        cardFixture({ id: 'cc', position: 'Zz' }),
        cardFixture({ id: 'ca', position: 'a0' }),
      ],
    });

    // Bytewise, uppercase sorts before lowercase ('Z' < 'a'); locale-aware order would not.
    expect(ids(buildRows(board)[0]?.cells.BACKLOG ?? [])).toEqual(['cc', 'ca', 'cb']);
  });

  it('keeps cards of a former member visible in the "Sin asignar" row', () => {
    const board = boardFixture({ cards: [cardFixture({ id: 'cgone', status: 'DONE', assigneeId: 'gone' })] });

    expect(ids(buildRows(board)[0]?.cells.DONE ?? [])).toEqual(['cgone']);
  });
});

describe('onlyRowOf ("solo mis tarjetas")', () => {
  it('keeps only the viewer row', () => {
    const rows = onlyRowOf(buildRows(boardFixture()), STUDENT_ID);

    expect(rows.map((row) => row.id)).toEqual([STUDENT_ID]);
  });
});

describe('cellCards', () => {
  it('returns the exact cell of the board, sorted, regardless of filters', () => {
    expect(ids(cellCards(boardFixture(), null, 'BACKLOG'))).toEqual(['cfree2', 'cfree1']);
    expect(ids(cellCards(boardFixture(), STUDENT_ID, 'DONE'))).toEqual([]);
  });
});

describe('permission mirror', () => {
  const board = boardFixture();
  const card = (id: string) => {
    const found = board.cards.find((c) => c.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const student = viewerOf(board, STUDENT_ID);
  const moderator = viewerOf(board, MODERATOR_ID);
  const outsider = viewerOf(board, 'teacher-1');

  it('derives membership and moderation from the board', () => {
    expect(student).toEqual({ userId: STUDENT_ID, isMember: true, isModerator: false });
    expect(moderator).toEqual({ userId: MODERATOR_ID, isMember: true, isModerator: true });
    expect(outsider).toEqual({ userId: 'teacher-1', isMember: false, isModerator: false });
  });

  it('lets a member edit own and unassigned backlog cards only', () => {
    expect(canEditCard(student, card('cmine'))).toBe(true);
    expect(canEditCard(student, card('cfree1'))).toBe(true);
    expect(canEditCard(student, card('cmod'))).toBe(false);
    expect(canEditCard(moderator, card('cother'))).toBe(true);
    expect(canEditCard(outsider, card('cfree1'))).toBe(false);
  });

  it('lets a member move into their own row or back to the unassigned backlog', () => {
    expect(canMoveCard(student, card('cmine'), { status: 'DOING', assigneeId: STUDENT_ID })).toBe(true);
    expect(canMoveCard(student, card('cmine'), { status: 'BACKLOG', assigneeId: null })).toBe(true);
    expect(canMoveCard(student, card('cmine'), { status: 'TODO', assigneeId: OTHER_ID })).toBe(false);
    expect(canMoveCard(student, card('cfree1'), { status: 'TODO', assigneeId: STUDENT_ID })).toBe(true);
    expect(canMoveCard(student, card('cother'), { status: 'DONE', assigneeId: OTHER_ID })).toBe(false);
  });

  it('lets the moderator move any card anywhere and the outsider nothing', () => {
    expect(canMoveCard(moderator, card('cother'), { status: 'DONE', assigneeId: STUDENT_ID })).toBe(true);
    expect(canMoveCard(outsider, card('cfree1'), { status: 'BACKLOG', assigneeId: null })).toBe(false);
  });

  it('offers only allowed rows per column, never "Sin asignar" outside the backlog', () => {
    const rows = buildRows(board);

    expect(moveTargetRows(student, card('cmine'), rows, 'BACKLOG').map((row) => row.id)).toEqual([
      UNASSIGNED_ROW_ID,
      STUDENT_ID,
    ]);
    expect(moveTargetRows(student, card('cmine'), rows, 'DONE').map((row) => row.id)).toEqual([STUDENT_ID]);
    expect(moveTargetRows(moderator, card('cmine'), rows, 'TODO').map((row) => row.id)).toEqual([
      MODERATOR_ID,
      STUDENT_ID,
      OTHER_ID,
    ]);
    expect(moveTargetRows(student, card('cmod'), rows, 'TODO')).toEqual([]);
  });
});

describe('allowedStatuses (sprint and validation gates)', () => {
  const sprint = sprintFixture();
  const backlog = cardFixture({ id: 'cb', assigneeId: STUDENT_ID });
  const pending = cardFixture({ id: 'cp', status: 'TODO', sprintId: SPRINT_ID, assigneeId: STUDENT_ID });
  const validated = { ...pending, id: 'cv', validated: true, validatedById: MODERATOR_ID };
  const doingValidated = { ...validated, id: 'cd', status: 'DOING' as const };
  const legacyDoing = cardFixture({ id: 'cl', status: 'DOING', sprintId: SPRINT_ID, assigneeId: STUDENT_ID });
  const orphan = cardFixture({ id: 'co', status: 'TODO', sprintId: null, assigneeId: STUDENT_ID, validated: true });

  it.each([
    ['a Backlog card without an open sprint', backlog, null, ['BACKLOG']],
    ['a Backlog card during a sprint (not validated yet)', backlog, sprint, ['BACKLOG', 'TODO']],
    ['an unvalidated Por hacer card', pending, sprint, ['BACKLOG', 'TODO']],
    ['a validated Por hacer card', validated, sprint, ['BACKLOG', 'TODO', 'DOING', 'DONE']],
    ['a validated En marcha card', doingValidated, sprint, ['BACKLOG', 'TODO', 'DOING', 'DONE']],
    ['an unvalidated card already in En marcha (it may stay there)', legacyDoing, sprint, ['BACKLOG', 'TODO', 'DOING']],
    ['a card outside the Backlog with no sprint and none open', orphan, null, ['BACKLOG']],
    ['a card outside the Backlog with no sprint while one is open', orphan, sprint, ['BACKLOG', 'TODO', 'DOING', 'DONE']],
  ] as const)('%s', (_name, card, openSprint, expected) => {
    expect(allowedStatuses(card, openSprint)).toEqual(expected);
  });
});

describe('positions', () => {
  const cell = [cardFixture({ id: 'c1', position: 'a0' }), cardFixture({ id: 'c2', position: 'a1' })];

  it('appends after the last card of a cell', () => {
    const position = positionAtEnd(cell);
    expect(position > 'a1').toBe(true);
    expect(positionAtEnd([])).toBe('a0');
  });

  it('ignores the moving card when it already sits in the target cell', () => {
    // Only 'a0' remains once c2 is ignored, so the end of the cell is right after it.
    expect(positionAtEnd(cell, 'c2')).toBe('a1');
    expect(positionAtEnd(cell, 'c1')).not.toBe('a1');
  });

  it('inserts between neighbours at an index', () => {
    const position = positionAt(cell, 1);
    expect(position > 'a0' && position < 'a1').toBe(true);
    expect(positionAt(cell, 0) < 'a0').toBe(true);
  });
});
