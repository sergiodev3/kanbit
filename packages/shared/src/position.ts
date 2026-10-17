import { generateKeyBetween } from 'fractional-indexing';

/**
 * Card ordering within a board cell uses fractional indexing (spec §6.1): moving a card rewrites only its own
 * `position`. Keys are compared bytewise, never with locale-aware collation.
 */

/** Generous bound: keys grow by about one character per repeated insert at the same spot. */
export const POSITION_MAX_LENGTH = 128;

const BASE_62 = /^[0-9A-Za-z]+$/;

/** A key strictly between `before` and `after`; null means "no neighbour" on that side. */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** Bytewise comparison (plain `<`/`>`, the same order as `COLLATE "C"`), usable as a sort comparator. */
export function comparePositions(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Whether `key` is a well-formed base-62 fractional index. */
export function isValidPosition(key: string): boolean {
  if (key.length === 0 || key.length > POSITION_MAX_LENGTH || !BASE_62.test(key)) return false;
  try {
    // The library validates both neighbours before generating; a malformed key throws.
    generateKeyBetween(key, null);
    return true;
  } catch {
    return false;
  }
}
