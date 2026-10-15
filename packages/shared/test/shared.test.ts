import { describe, expect, it } from 'vitest';
import { Weekday, cuid2Id } from '../src/index';

describe('shared schemas', () => {
  it('accepts only school weekdays', () => {
    expect(Weekday.options).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(Weekday.safeParse('SAT').success).toBe(false);
  });

  it('validates cuid2 ids', () => {
    expect(cuid2Id.safeParse('tz4a98xxat96iws9zmbrgj3a').success).toBe(true);
    expect(cuid2Id.safeParse('Not-A-Cuid!').success).toBe(false);
  });
});
