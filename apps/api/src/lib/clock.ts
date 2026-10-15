import { TZDate } from '@date-fns/tz';
import type { Weekday } from '@kanbit/shared';
import { addDays, format, getISODay, startOfISOWeek } from 'date-fns';

/** All date logic goes through this module so tests can inject "now" (spec §14). */
export const DEFAULT_TIME_ZONE = 'America/Monterrey';

/** Calendar date as `YYYY-MM-DD` (maps to Postgres `date`). */
export type IsoDate = string;

export interface WeekBounds {
  monday: IsoDate;
  friday: IsoDate;
}

export interface Clock {
  now(): Date;
  todayInZone(timeZone?: string): IsoDate;
  /** School weekday in the zone, or null on Saturday/Sunday. */
  weekdayInZone(timeZone?: string): Weekday | null;
  /** Monday and Friday of the ISO week that contains "today" in the zone. */
  weekBounds(timeZone?: string): WeekBounds;
}

// ISO day numbers: 1 = Monday ... 7 = Sunday.
const SCHOOL_DAYS: Record<number, Weekday> = { 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI' };

const toIsoDate = (date: Date): IsoDate => format(date, 'yyyy-MM-dd');

export function createClock(now: () => Date = () => new Date()): Clock {
  const zoned = (timeZone: string) => new TZDate(now().getTime(), timeZone);

  return {
    now: () => new Date(now().getTime()),
    todayInZone: (timeZone = DEFAULT_TIME_ZONE) => toIsoDate(zoned(timeZone)),
    weekdayInZone: (timeZone = DEFAULT_TIME_ZONE) => SCHOOL_DAYS[getISODay(zoned(timeZone))] ?? null,
    weekBounds: (timeZone = DEFAULT_TIME_ZONE) => {
      const monday = startOfISOWeek(zoned(timeZone));
      return { monday: toIsoDate(monday), friday: toIsoDate(addDays(monday, 4)) };
    },
  };
}

export const systemClock = createClock();
