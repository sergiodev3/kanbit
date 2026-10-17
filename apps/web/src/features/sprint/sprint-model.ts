import type { BoardResponse, BoardSprint } from '@kanbit/shared';

// Fixed es-MX abbreviations instead of `Intl`, whose short month names vary between ICU builds ("sep" / "sept").
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

interface CalendarDay {
  weekday: string;
  day: number;
  month: string;
}

// Display only: a calendar date read as UTC midnight is the same day in any zone; no client clock is involved.
function calendarDay(isoDate: string): CalendarDay {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return { weekday: WEEKDAYS[date.getUTCDay()] ?? '', day: date.getUTCDate(), month: MONTHS[date.getUTCMonth()] ?? '' };
}

/** "lun 19 – vie 23 oct", or "lun 28 sep – vie 2 oct" when the week spans two months. */
export function formatSprintRange(sprint: Pick<BoardSprint, 'startDate' | 'endDate'>): string {
  const start = calendarDay(sprint.startDate);
  const end = calendarDay(sprint.endDate);
  const startText = `${start.weekday} ${start.day}${start.month === end.month ? '' : ` ${start.month}`}`;
  return `${startText} – ${end.weekday} ${end.day} ${end.month}`;
}

const inOpenSprint = (board: BoardResponse) => (card: BoardResponse['cards'][number]) =>
  board.sprint !== null && card.sprintId === board.sprint.id;

/** Cards "Validar todas" would validate: in Por hacer, unvalidated, in the open sprint (mirrors the API). */
export const pendingValidationCount = (board: BoardResponse): number =>
  board.cards.filter(inOpenSprint(board)).filter((card) => card.status === 'TODO' && !card.validated).length;

/** Cards the close sends back to the Backlog: every unfinished card of the open sprint. */
export const unfinishedCount = (board: BoardResponse): number =>
  board.cards.filter(inOpenSprint(board)).filter((card) => card.status !== 'DONE').length;
