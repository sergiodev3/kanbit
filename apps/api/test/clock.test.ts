import { describe, expect, it } from 'vitest';
import { createClock, DEFAULT_TIME_ZONE } from '../src/lib/clock';

const MTY = 'America/Monterrey';

const at = (iso: string) => createClock(() => new Date(iso));

describe('clock', () => {
  it('defaults to America/Monterrey', () => {
    expect(DEFAULT_TIME_ZONE).toBe(MTY);
    expect(at('2026-10-20T03:00:00Z').todayInZone()).toBe('2026-10-19');
  });

  it('returns the injected instant from now()', () => {
    expect(at('2026-10-19T15:00:00Z').now().toISOString()).toBe('2026-10-19T15:00:00.000Z');
  });

  it('keeps the local day near midnight UTC (Tue 03:00Z is still Monday in Monterrey)', () => {
    const clock = at('2026-10-20T03:00:00Z');
    expect(clock.todayInZone(MTY)).toBe('2026-10-19');
    expect(clock.weekdayInZone(MTY)).toBe('MON');
    expect(clock.todayInZone('UTC')).toBe('2026-10-20');
    expect(clock.weekdayInZone('UTC')).toBe('TUE');
  });

  it('maps every school day and returns null on weekends', () => {
    expect(at('2026-10-23T18:00:00Z').weekdayInZone(MTY)).toBe('FRI');
    expect(at('2026-10-24T18:00:00Z').weekdayInZone(MTY)).toBeNull();
    expect(at('2026-10-25T18:00:00Z').weekdayInZone(MTY)).toBeNull();
    // Saturday 02:00Z is still Friday evening in Monterrey.
    expect(at('2026-10-24T02:00:00Z').weekdayInZone(MTY)).toBe('FRI');
  });

  it('returns Monday–Friday bounds of the current local week', () => {
    expect(at('2026-10-21T17:00:00Z').weekBounds(MTY)).toEqual({
      monday: '2026-10-19',
      friday: '2026-10-23',
    });
    // Monday early UTC is still Sunday locally: bounds belong to the previous week.
    expect(at('2026-10-19T03:00:00Z').weekBounds(MTY)).toEqual({
      monday: '2026-10-12',
      friday: '2026-10-16',
    });
    // Sunday maps to its own ISO week (Mon 19 – Fri 23 Oct for Sun 25 Oct).
    expect(at('2026-10-25T18:00:00Z').weekBounds(MTY)).toEqual({
      monday: '2026-10-19',
      friday: '2026-10-23',
    });
  });

  describe('sprintWeek (spec §7.2)', () => {
    it('returns Monday–Friday of the current week on a weekday', () => {
      // Wednesday 21 Oct 2026.
      expect(at('2026-10-21T17:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-19', friday: '2026-10-23' });
      // Monday and Friday themselves.
      expect(at('2026-10-19T15:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-19', friday: '2026-10-23' });
      expect(at('2026-10-23T18:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-19', friday: '2026-10-23' });
    });

    it('returns the next week on Saturday and Sunday', () => {
      expect(at('2026-10-24T18:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-26', friday: '2026-10-30' });
      expect(at('2026-10-25T18:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-26', friday: '2026-10-30' });
    });

    it('decides the day in the group zone near midnight', () => {
      // Saturday 02:00Z is still Friday evening in Monterrey: the current week.
      expect(at('2026-10-24T02:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-19', friday: '2026-10-23' });
      expect(at('2026-10-24T02:00:00Z').sprintWeek('UTC')).toEqual({ monday: '2026-10-26', friday: '2026-10-30' });
      // Monday 03:00Z is still Sunday in Monterrey: already the week that starts that Monday.
      expect(at('2026-10-19T03:00:00Z').sprintWeek(MTY)).toEqual({ monday: '2026-10-19', friday: '2026-10-23' });
    });

    it('defaults to America/Monterrey', () => {
      expect(at('2026-10-24T02:00:00Z').sprintWeek()).toEqual({ monday: '2026-10-19', friday: '2026-10-23' });
    });
  });
});
