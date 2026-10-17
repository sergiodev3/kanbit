import { describe, expect, it } from 'vitest';
import { meetingDurationSeconds } from '../src/modules/meetings/meeting.rules';

describe('meetingDurationSeconds', () => {
  const start = new Date('2026-10-21T16:00:00.000Z');

  it('counts whole seconds between start and end', () => {
    expect(meetingDurationSeconds(start, new Date('2026-10-21T16:14:30.000Z'))).toBe(870);
    expect(meetingDurationSeconds(start, start)).toBe(0);
  });

  it('drops the fraction of a second instead of rounding up', () => {
    expect(meetingDurationSeconds(start, new Date('2026-10-21T16:00:09.999Z'))).toBe(9);
  });

  it('never goes negative', () => {
    expect(meetingDurationSeconds(start, new Date('2026-10-21T15:59:59.000Z'))).toBe(0);
  });
});
