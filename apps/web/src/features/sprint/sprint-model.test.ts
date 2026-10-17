import type { BoardResponse } from '@kanbit/shared';
import { describe, expect, it } from 'vitest';
import { openSprintBoardFixture } from '../../test/board-fixtures';
import { sprintDeadlineNotice } from './sprint-model';

// The fixture sprint runs Mon 2026-10-19 – Fri 2026-10-23.
const onDay = (weekday: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI', date: string): BoardResponse =>
  openSprintBoardFixture({ today: { date, weekday } });

describe('sprintDeadlineNotice', () => {
  it('stays quiet on Monday and Tuesday', () => {
    expect(sprintDeadlineNotice(onDay('MON', '2026-10-19'))).toBeNull();
    expect(sprintDeadlineNotice(onDay('TUE', '2026-10-20'))).toBeNull();
  });

  it('counts the remaining days and the unfinished cards from Wednesday', () => {
    const notice = sprintDeadlineNotice(onDay('WED', '2026-10-21'));
    expect(notice?.level).toBe('info');
    expect(notice?.text).toMatch(/^Quedan 3 días de sprint · \d+ tarjetas? sin terminar\.$/);
  });

  it('raises the tone on Thursday and Friday', () => {
    const thursday = sprintDeadlineNotice(onDay('THU', '2026-10-22'));
    expect(thursday?.level).toBe('warning');
    expect(thursday?.text).toMatch(/^Quedan 2 días de sprint/);
    const friday = sprintDeadlineNotice(onDay('FRI', '2026-10-23'));
    expect(friday?.level).toBe('urgent');
    expect(friday?.text).toMatch(/^Hoy cierra el sprint/);
  });

  it('uses the singular for a single unfinished card', () => {
    const board = onDay('FRI', '2026-10-23');
    const [first] = board.cards.filter((card) => card.sprintId === board.sprint?.id);
    const cards = board.cards.map((card) =>
      card.sprintId === board.sprint?.id && card.id !== first?.id ? { ...card, status: 'DONE' as const } : card,
    );
    expect(sprintDeadlineNotice({ ...board, cards })?.text).toBe('Hoy cierra el sprint · 1 tarjeta sin terminar.');
  });

  it('says nothing once every sprint card is done', () => {
    const board = onDay('FRI', '2026-10-23');
    const cards = board.cards.map((card) =>
      card.sprintId === board.sprint?.id ? { ...card, status: 'DONE' as const } : card,
    );
    expect(sprintDeadlineNotice({ ...board, cards })).toBeNull();
  });

  it('says nothing without an open sprint, on weekends or outside the sprint week', () => {
    expect(sprintDeadlineNotice(openSprintBoardFixture({ sprint: null, today: { date: '2026-10-23', weekday: 'FRI' } }))).toBeNull();
    expect(sprintDeadlineNotice(openSprintBoardFixture({ today: { date: '2026-10-24', weekday: null } }))).toBeNull();
    expect(sprintDeadlineNotice(onDay('THU', '2026-10-29'))).toBeNull();
  });
});
