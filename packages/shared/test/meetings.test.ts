import { describe, expect, it } from 'vitest';
import {
  MEETING_TEXT_MAX_LENGTH,
  MeetingResponse,
  type MeetingType,
  TodayMeetingResponse,
  UpdateMeetingRequest,
  type Weekday,
  meetingTypeForWeekday,
} from '../src/index';

const meeting = {
  id: 'mz4a98xxat96iws9zmbrgj3a',
  sprintId: 'sz4a98xxat96iws9zmbrgj3a',
  teamId: 'tz4a98xxat96iws9zmbrgj3b',
  type: 'FOLLOWUP',
  date: '2026-10-21',
  startedAt: null,
  endedAt: null,
  durationSeconds: null,
  notesMd: null,
  agreements: null,
  facilitatorId: null,
  updatedAt: '2026-10-21T16:00:00.000Z',
};

describe('meetingTypeForWeekday', () => {
  it('suggests Arranque on Monday, Seguimiento Tuesday to Thursday and Cierre on Friday', () => {
    const expected: Record<Weekday, MeetingType> = {
      MON: 'KICKOFF',
      TUE: 'FOLLOWUP',
      WED: 'FOLLOWUP',
      THU: 'FOLLOWUP',
      FRI: 'CLOSING',
    };
    for (const [weekday, type] of Object.entries(expected)) {
      expect(meetingTypeForWeekday(weekday as Weekday)).toBe(type);
    }
  });
});

describe('UpdateMeetingRequest', () => {
  it('accepts notes and agreements, turns blank text into null and keeps the optimistic lock', () => {
    expect(UpdateMeetingRequest.parse({ notesMd: '# Notas', agreements: '' })).toEqual({
      notesMd: '# Notas',
      agreements: null,
    });
    expect(UpdateMeetingRequest.parse({ notesMd: null, expectedUpdatedAt: meeting.updatedAt })).toEqual({
      notesMd: null,
      expectedUpdatedAt: meeting.updatedAt,
    });
  });

  it('needs at least one field and bounds the text', () => {
    expect(UpdateMeetingRequest.safeParse({}).success).toBe(false);
    expect(UpdateMeetingRequest.safeParse({ expectedUpdatedAt: meeting.updatedAt }).success).toBe(false);
    expect(UpdateMeetingRequest.safeParse({ notesMd: 'a'.repeat(MEETING_TEXT_MAX_LENGTH) }).success).toBe(true);
    expect(UpdateMeetingRequest.safeParse({ notesMd: 'a'.repeat(MEETING_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
    expect(UpdateMeetingRequest.safeParse({ notesMd: 'x', expectedUpdatedAt: 'yesterday' }).success).toBe(false);
  });
});

describe('MeetingResponse', () => {
  it('carries the meeting with its team and null timing until it starts', () => {
    expect(MeetingResponse.parse(meeting)).toEqual(meeting);
    expect(MeetingResponse.safeParse({ ...meeting, type: 'DAILY' }).success).toBe(false);
    expect(MeetingResponse.safeParse({ ...meeting, date: '21/10/2026' }).success).toBe(false);
  });
});

describe('TodayMeetingResponse', () => {
  it('has a null type and meeting when there is nothing to suggest', () => {
    const none = { suggestedType: null, date: '2026-10-24', meeting: null };
    expect(TodayMeetingResponse.parse(none)).toEqual(none);
    const some = { suggestedType: 'FOLLOWUP', date: '2026-10-21', meeting };
    expect(TodayMeetingResponse.parse(some)).toEqual(some);
    expect(TodayMeetingResponse.safeParse({ date: '2026-10-21', meeting: null }).success).toBe(false);
  });
});
