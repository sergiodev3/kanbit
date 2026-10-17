import { describe, expect, it } from 'vitest';
import { boardFixture, MODERATOR_ID, openSprintBoardFixture, OTHER_ID, STUDENT_ID } from '../../test/board-fixtures';
import { checkinFixture } from '../../test/meeting-fixtures';
import {
  changedCheckinTexts,
  checkinRows,
  checkinTextsOf,
  formatDuration,
  formatMeetingDate,
  meetingPath,
  meetingTypeLabel,
  noMeetingReason,
  NO_MEETING_MESSAGES,
  projectionPath,
} from './meetings-model';

describe('meeting and projection paths', () => {
  it('sends a student to the own-team routes', () => {
    expect(meetingPath('t1', false)).toBe('/team/meeting');
    expect(projectionPath('t1', false)).toBe('/team/meeting/projection');
  });

  it('sends the teacher to the routes of the team', () => {
    expect(meetingPath('t1', true)).toBe('/teacher/teams/t1/meeting');
    expect(projectionPath('t1', true)).toBe('/teacher/teams/t1/meeting/projection');
  });
});

describe('meetingTypeLabel', () => {
  it.each([
    ['KICKOFF', 'Arranque'],
    ['FOLLOWUP', 'Seguimiento'],
    ['CLOSING', 'Cierre'],
  ] as const)('labels %s as %s', (type, label) => {
    expect(meetingTypeLabel(type)).toBe(label);
  });
});

describe('formatMeetingDate', () => {
  it('writes the calendar date in Spanish without any device clock or zone', () => {
    expect(formatMeetingDate('2026-10-19')).toBe('lunes 19 de octubre de 2026');
    expect(formatMeetingDate('2026-12-04')).toBe('viernes 4 de diciembre de 2026');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0 min 00 s'],
    [5, '0 min 05 s'],
    [725, '12 min 05 s'],
    [3600, '60 min 00 s'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe('noMeetingReason', () => {
  it('is null on a school day with an open sprint', () => {
    expect(noMeetingReason(openSprintBoardFixture())).toBeNull();
  });

  it('blames the missing sprint first', () => {
    expect(noMeetingReason(boardFixture({ today: { date: '2026-10-17', weekday: null } }))).toBe('no-open-sprint');
    expect(noMeetingReason(boardFixture())).toBe('no-open-sprint');
  });

  it('blames the weekend when a sprint is open but today is not a school day', () => {
    const board = openSprintBoardFixture({ today: { date: '2026-10-24', weekday: null } });
    expect(noMeetingReason(board)).toBe('weekend');
  });

  it('has Spanish copy for both reasons', () => {
    expect(NO_MEETING_MESSAGES['no-open-sprint']).toMatch(/sprint abierto/);
    expect(NO_MEETING_MESSAGES.weekend).toMatch(/fin de semana/);
  });
});

describe('checkinRows', () => {
  const board = boardFixture();

  it('lists every member in row order, with null for members without a check-in', () => {
    const checkins = [checkinFixture({ userId: OTHER_ID, did: 'Hice el logo' })];

    const rows = checkinRows(board.members, checkins);

    expect(rows.map((row) => row.member.name)).toEqual(['Ana López', 'Luis Alumno', 'Carla Díaz']);
    expect(rows.map((row) => row.checkin?.did ?? null)).toEqual([null, null, 'Hice el logo']);
  });

  it('ignores check-ins of people who left the team', () => {
    const rows = checkinRows(board.members, [checkinFixture({ userId: 'gone' })]);
    expect(rows.every((row) => row.checkin === null)).toBe(true);
  });
});

describe('checkin texts', () => {
  it('reads null texts as empty strings and keeps the others', () => {
    expect(checkinTextsOf(null)).toEqual({ did: '', doing: '', willDo: '', blockers: '' });
    expect(checkinTextsOf(checkinFixture({ userId: STUDENT_ID, did: 'A', blockers: 'B' }))).toEqual({
      did: 'A',
      doing: '',
      willDo: '',
      blockers: 'B',
    });
  });

  it('returns only the fields that differ from the saved check-in, compared trimmed', () => {
    const saved = checkinFixture({ userId: MODERATOR_ID, did: 'A', doing: 'B' });

    expect(changedCheckinTexts({ did: ' A ', doing: 'B2', willDo: '', blockers: 'C' }, saved)).toEqual({
      doing: 'B2',
      blockers: 'C',
    });
    expect(changedCheckinTexts({ did: 'A', doing: 'B', willDo: '  ', blockers: '' }, saved)).toEqual({});
  });

  it('treats every non-empty text as changed when there is no saved check-in', () => {
    expect(changedCheckinTexts({ did: 'A', doing: '', willDo: '', blockers: '' }, null)).toEqual({ did: 'A' });
  });
});
