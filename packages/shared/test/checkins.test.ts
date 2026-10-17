import { describe, expect, it } from 'vitest';
import {
  CHECKIN_TEXT_MAX_LENGTH,
  CheckinResponse,
  MeetingDetailResponse,
  PatchCheckinRequest,
  PutCheckinRequest,
} from '../src/index';

const id = 'cz4a98xxat96iws9zmbrgj3a';
const updatedAt = '2026-10-21T16:00:00.000Z';

const checkin = {
  id,
  meetingId: 'mz4a98xxat96iws9zmbrgj3a',
  userId: 'uz4a98xxat96iws9zmbrgj3a',
  did: 'Terminé el login',
  doing: null,
  willDo: null,
  blockers: null,
  present: true,
  capturedById: null,
  updatedAt,
};

describe('PutCheckinRequest', () => {
  it('needs a client id and defaults to present with every text empty', () => {
    expect(PutCheckinRequest.parse({ id })).toEqual({ id, present: true });
    expect(PutCheckinRequest.safeParse({}).success).toBe(false);
    expect(PutCheckinRequest.safeParse({ id: 'Not A Cuid' }).success).toBe(false);
  });

  it('trims the text, turns blank text into null and keeps the optimistic lock', () => {
    expect(
      PutCheckinRequest.parse({
        id,
        did: '  Hice el login  ',
        doing: '   ',
        willDo: null,
        blockers: '',
        present: false,
        expectedUpdatedAt: updatedAt,
      }),
    ).toEqual({
      id,
      did: 'Hice el login',
      doing: null,
      willDo: null,
      blockers: null,
      present: false,
      expectedUpdatedAt: updatedAt,
    });
  });

  it('bounds each text after trimming', () => {
    const max = 'a'.repeat(CHECKIN_TEXT_MAX_LENGTH);
    expect(PutCheckinRequest.safeParse({ id, did: max }).success).toBe(true);
    expect(PutCheckinRequest.safeParse({ id, blockers: ` ${max} ` }).success).toBe(true);
    expect(PutCheckinRequest.safeParse({ id, willDo: `${max}a` }).success).toBe(false);
    expect(PutCheckinRequest.safeParse({ id, doing: 5 }).success).toBe(false);
    expect(PutCheckinRequest.safeParse({ id, expectedUpdatedAt: 'yesterday' }).success).toBe(false);
  });
});

describe('PatchCheckinRequest', () => {
  it('changes only what it carries, without defaulting `present`', () => {
    expect(PatchCheckinRequest.parse({ doing: ' Tests ' })).toEqual({ doing: 'Tests' });
    expect(PatchCheckinRequest.parse({ present: false })).toEqual({ present: false });
    expect(PatchCheckinRequest.parse({ blockers: '' })).toEqual({ blockers: null });
  });

  it('needs at least one field or `present`', () => {
    expect(PatchCheckinRequest.safeParse({}).success).toBe(false);
    expect(PatchCheckinRequest.safeParse({ expectedUpdatedAt: updatedAt }).success).toBe(false);
    expect(PatchCheckinRequest.safeParse({ did: null, expectedUpdatedAt: updatedAt }).success).toBe(true);
  });
});

describe('CheckinResponse and MeetingDetailResponse', () => {
  it('carries the check-in with who captured it', () => {
    expect(CheckinResponse.parse(checkin)).toEqual(checkin);
    expect(CheckinResponse.parse({ ...checkin, capturedById: 'wz4a98xxat96iws9zmbrgj3a' }).capturedById).toBe(
      'wz4a98xxat96iws9zmbrgj3a',
    );
    expect(CheckinResponse.safeParse({ ...checkin, present: 'yes' }).success).toBe(false);
  });

  it('adds the check-ins to the meeting', () => {
    const meeting = {
      id: checkin.meetingId,
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
      updatedAt,
    };
    expect(MeetingDetailResponse.parse({ ...meeting, checkins: [checkin] }).checkins).toEqual([checkin]);
    expect(MeetingDetailResponse.safeParse(meeting).success).toBe(false);
  });
});
