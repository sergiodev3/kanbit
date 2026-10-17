import type { BoardSprint, BoardToday, CardResponse } from './cards';
import type { Weekday } from './enums';

/** School days in week order (Monday = 0 ... Friday = 4). */
export const WEEKDAY_ORDER: Readonly<Record<Weekday, number>> = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4 };

/** "Vence hoy" or "Atrasada" (spec §7.3). */
export type CardDue = 'TODAY' | 'OVERDUE';

export interface CardVisualState {
  /** "Por validar": in Por hacer and not yet validated by the moderator. */
  pendingValidation: boolean;
  due: CardDue | null;
}

export type CardStateInput = Pick<CardResponse, 'status' | 'validated' | 'dueWeekday'>;
export type SprintWeekInput = Pick<BoardSprint, 'startDate' | 'endDate'>;

/**
 * Visual state of a card on the board (spec §7.3), from the server's "today" (spec §7.1). The due state only
 * applies to unfinished sprint cards with a due weekday: none before the sprint week, OVERDUE once the week is
 * over, and within the week the card's weekday compared with today's. ISO dates compare as strings.
 */
export function cardVisualState(
  card: CardStateInput,
  sprint: SprintWeekInput | null,
  today: BoardToday,
): CardVisualState {
  const pendingValidation = card.status === 'TODO' && !card.validated;
  return { pendingValidation, due: dueState(card, sprint, today) };
}

function dueState(card: CardStateInput, sprint: SprintWeekInput | null, today: BoardToday): CardDue | null {
  if (card.status === 'BACKLOG' || card.status === 'DONE') return null;
  if (card.dueWeekday === null || sprint === null) return null;
  if (today.date < sprint.startDate) return null;
  if (today.date > sprint.endDate) return 'OVERDUE';
  // Inside the Monday–Friday sprint week today is always a school day; stay neutral if it is not.
  if (today.weekday === null) return null;
  const diff = WEEKDAY_ORDER[card.dueWeekday] - WEEKDAY_ORDER[today.weekday];
  if (diff === 0) return 'TODAY';
  return diff < 0 ? 'OVERDUE' : null;
}
