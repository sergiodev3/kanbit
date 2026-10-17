import {
  comparePositions,
  positionBetween,
  type BoardResponse,
  type CardResponse,
  type CardStatus,
  type Weekday,
} from '@kanbit/shared';

/** The four fixed columns (spec §2.4). */
export const BOARD_COLUMNS: readonly { status: CardStatus; label: string }[] = [
  { status: 'BACKLOG', label: 'Backlog' },
  { status: 'TODO', label: 'Por hacer' },
  { status: 'DOING', label: 'En marcha' },
  { status: 'DONE', label: 'Terminado' },
];

export const columnLabel = (status: CardStatus): string =>
  BOARD_COLUMNS.find((column) => column.status === status)?.label ?? status;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MON: 'Lunes',
  TUE: 'Martes',
  WED: 'Miércoles',
  THU: 'Jueves',
  FRI: 'Viernes',
};

export const UNASSIGNED_ROW_ID = 'unassigned';
export const UNASSIGNED_LABEL = 'Sin asignar';

export type BoardCells = Record<CardStatus, CardResponse[]>;

export interface BoardRow {
  /** A member's user id, or `UNASSIGNED_ROW_ID`. */
  id: string;
  /** Assignee a card gets when moved into this row. */
  assigneeId: string | null;
  label: string;
  isModerator: boolean;
  cells: BoardCells;
}

/** Card order within a cell: bytewise position, then id (never locale-aware). */
export const compareCards = (a: CardResponse, b: CardResponse): number =>
  comparePositions(a.position, b.position) || comparePositions(a.id, b.id);

const emptyCells = (): BoardCells => ({ BACKLOG: [], TODO: [], DOING: [], DONE: [] });

/**
 * Board rows (spec §2.4): "Sin asignar" first, then one row per member by `rowOrder`. Cards of someone who is no
 * longer a member stay visible in the "Sin asignar" row instead of disappearing.
 */
export function buildRows(board: BoardResponse): BoardRow[] {
  const members = [...board.members].sort((a, b) => a.rowOrder - b.rowOrder);
  const rows: BoardRow[] = [
    { id: UNASSIGNED_ROW_ID, assigneeId: null, label: UNASSIGNED_LABEL, isModerator: false, cells: emptyCells() },
    ...members.map((member) => ({
      id: member.userId,
      assigneeId: member.userId,
      label: member.name,
      isModerator: member.userId === board.team.moderatorId,
      cells: emptyCells(),
    })),
  ];
  const byAssignee = new Map(rows.map((row) => [row.assigneeId, row]));
  const unassigned = rows[0] as BoardRow;
  for (const card of [...board.cards].sort(compareCards)) {
    (byAssignee.get(card.assigneeId) ?? unassigned).cells[card.status].push(card);
  }
  return rows;
}

/** "Solo mis tarjetas": the viewer's own row only. */
export const onlyRowOf = (rows: readonly BoardRow[], userId: string): BoardRow[] =>
  rows.filter((row) => row.assigneeId === userId);

/** The exact server cell `(assigneeId, status)`, sorted; independent of display filters. */
export const cellCards = (board: BoardResponse, assigneeId: string | null, status: CardStatus): CardResponse[] =>
  board.cards.filter((card) => card.assigneeId === assigneeId && card.status === status).sort(compareCards);

// Client mirror of the API permissions (spec §3, `apps/api/src/http/authz.ts`): it only hides or disables
// actions; the server stays authoritative.

export interface Viewer {
  userId: string;
  isMember: boolean;
  isModerator: boolean;
}

export interface CardTarget {
  status: CardStatus;
  assigneeId: string | null;
}

export const viewerOf = (board: BoardResponse, userId: string): Viewer => ({
  userId,
  isMember: board.members.some((member) => member.userId === userId),
  isModerator: board.team.moderatorId === userId,
});

/** The moderator, the assignee, or any member while the card is an unassigned Backlog card. */
export const canEditCard = (viewer: Viewer, card: CardResponse): boolean =>
  viewer.isModerator ||
  (viewer.isMember && (card.assigneeId === viewer.userId || (card.assigneeId === null && card.status === 'BACKLOG')));

/** The moderator anywhere; a member moves editable cards into their own row or back to the unassigned Backlog. */
export const canMoveCard = (viewer: Viewer, card: CardResponse, target: CardTarget): boolean =>
  viewer.isModerator ||
  (canEditCard(viewer, card) &&
    (target.assigneeId === viewer.userId || (target.assigneeId === null && target.status === 'BACKLOG')));

/** Rows the viewer may move `card` into for a column; "Sin asignar" only exists in the Backlog. */
export const moveTargetRows = (
  viewer: Viewer,
  card: CardResponse,
  rows: readonly BoardRow[],
  status: CardStatus,
): BoardRow[] =>
  rows.filter(
    (row) =>
      (row.assigneeId !== null || status === 'BACKLOG') &&
      canMoveCard(viewer, card, { status, assigneeId: row.assigneeId }),
  );

/**
 * Position for inserting at `index` of a sorted cell. `movingId` is left out first, so a card moved within its
 * own cell never counts as its own neighbour.
 */
export function positionAt(cell: readonly CardResponse[], index: number, movingId?: string): string {
  const others = withoutCard(cell, movingId);
  const at = Math.max(0, Math.min(index, others.length));
  return positionBetween(others[at - 1]?.position ?? null, others[at]?.position ?? null);
}

export const positionAtEnd = (cell: readonly CardResponse[], movingId?: string): string =>
  positionAt(cell, withoutCard(cell, movingId).length, movingId);

const withoutCard = (cell: readonly CardResponse[], cardId: string | undefined): readonly CardResponse[] =>
  cardId === undefined ? cell : cell.filter((card) => card.id !== cardId);
