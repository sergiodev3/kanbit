import { describe, expect, it } from 'vitest';
import {
  BoardResponse,
  BoardToday,
  type CardStatus,
  type Weekday,
  WEEKDAY_ORDER,
  cardVisualState,
} from '../src/index';

/** Sprint week Mon 19 – Fri 23 Oct 2026. */
const sprint = { startDate: '2026-10-19', endDate: '2026-10-23' };
const WEEK: Record<Weekday, string> = {
  MON: '2026-10-19',
  TUE: '2026-10-20',
  WED: '2026-10-21',
  THU: '2026-10-22',
  FRI: '2026-10-23',
};
const on = (weekday: Weekday) => ({ date: WEEK[weekday], weekday });
const card = (dueWeekday: Weekday | null, status: CardStatus = 'TODO', validated = true) => ({
  status,
  validated,
  dueWeekday,
});

describe('WEEKDAY_ORDER', () => {
  it('orders the school days Monday to Friday', () => {
    expect(WEEKDAY_ORDER).toEqual({ MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4 });
  });
});

describe('cardVisualState', () => {
  it('marks only unvalidated TODO cards as pending validation', () => {
    const today = on('MON');
    expect(cardVisualState(card('FRI', 'TODO', false), sprint, today).pendingValidation).toBe(true);
    expect(cardVisualState(card('FRI', 'TODO', true), sprint, today).pendingValidation).toBe(false);
    expect(cardVisualState(card('FRI', 'BACKLOG', false), null, today).pendingValidation).toBe(false);
    expect(cardVisualState(card('FRI', 'DOING', false), sprint, today).pendingValidation).toBe(false);
  });

  it('is due TODAY on its weekday, OVERDUE after it and not due before it (Mon–Fri matrix)', () => {
    const expected: Record<Weekday, Record<Weekday, 'TODAY' | 'OVERDUE' | null>> = {
      // card day →        MON        TUE        WED        THU        FRI
      MON: { MON: 'TODAY', TUE: null, WED: null, THU: null, FRI: null },
      TUE: { MON: 'OVERDUE', TUE: 'TODAY', WED: null, THU: null, FRI: null },
      WED: { MON: 'OVERDUE', TUE: 'OVERDUE', WED: 'TODAY', THU: null, FRI: null },
      THU: { MON: 'OVERDUE', TUE: 'OVERDUE', WED: 'OVERDUE', THU: 'TODAY', FRI: null },
      FRI: { MON: 'OVERDUE', TUE: 'OVERDUE', WED: 'OVERDUE', THU: 'OVERDUE', FRI: 'TODAY' },
    };
    for (const [today, row] of Object.entries(expected) as [Weekday, Record<Weekday, string | null>][]) {
      for (const [due, state] of Object.entries(row) as [Weekday, string | null][]) {
        expect({ today, due, state: cardVisualState(card(due, 'DOING'), sprint, on(today)).due }).toEqual({
          today,
          due,
          state,
        });
      }
    }
  });

  it('is not due before the sprint week and is OVERDUE once it is over', () => {
    const sundayBefore = { date: '2026-10-18', weekday: null };
    const fridayBefore = { date: '2026-10-16', weekday: 'FRI' as const };
    const saturdayAfter = { date: '2026-10-24', weekday: null };
    const mondayAfter = { date: '2026-10-26', weekday: 'MON' as const };

    expect(cardVisualState(card('MON'), sprint, sundayBefore).due).toBeNull();
    expect(cardVisualState(card('MON'), sprint, fridayBefore).due).toBeNull();
    expect(cardVisualState(card('FRI'), sprint, saturdayAfter).due).toBe('OVERDUE');
    expect(cardVisualState(card('FRI'), sprint, mondayAfter).due).toBe('OVERDUE');
  });

  it('never marks DONE or BACKLOG cards, cards without a day, or cards without a sprint', () => {
    const today = on('WED');
    expect(cardVisualState(card('MON', 'DONE'), sprint, today).due).toBeNull();
    expect(cardVisualState(card('WED', 'DONE'), sprint, today).due).toBeNull();
    expect(cardVisualState(card('MON', 'BACKLOG'), sprint, today).due).toBeNull();
    expect(cardVisualState(card(null), sprint, today).due).toBeNull();
    expect(cardVisualState(card('MON'), null, today).due).toBeNull();
  });
});

describe('BoardToday', () => {
  it('is a calendar date plus the school weekday, null on weekends', () => {
    expect(BoardToday.parse({ date: '2026-10-20', weekday: 'TUE' })).toEqual({ date: '2026-10-20', weekday: 'TUE' });
    expect(BoardToday.parse({ date: '2026-10-24', weekday: null }).weekday).toBeNull();
    expect(BoardToday.safeParse({ date: '20/10/2026', weekday: 'TUE' }).success).toBe(false);
    expect(BoardToday.safeParse({ date: '2026-10-24', weekday: 'SAT' }).success).toBe(false);
  });

  it('is part of the board response', () => {
    expect(BoardResponse.shape.today).toBe(BoardToday);
  });
});
