import { describe, expect, it } from 'vitest';
import { comparePositions, isValidPosition, positionBetween } from '../src/index';

describe('positionBetween', () => {
  it('starts an empty cell with the first key', () => {
    expect(positionBetween(null, null)).toBe('a0');
  });

  it('appends after the last key and prepends before the first', () => {
    expect(positionBetween('a0', null)).toBe('a1');
    expect(positionBetween(null, 'a0')).toBe('Zz');
  });

  it('returns a key strictly between its neighbours', () => {
    const middle = positionBetween('a0', 'a1');
    expect(middle).toBe('a0V');
    expect(comparePositions('a0', middle)).toBeLessThan(0);
    expect(comparePositions(middle, 'a1')).toBeLessThan(0);
  });

  it('rejects neighbours given out of order', () => {
    expect(() => positionBetween('a1', 'a0')).toThrow();
  });
});

describe('comparePositions', () => {
  it('orders bytewise: uppercase before lowercase, unlike locale collation', () => {
    expect(comparePositions('Zz', 'a0')).toBeLessThan(0);
    expect(comparePositions('a0V', 'a0a')).toBeLessThan(0);
    expect(comparePositions('a0', 'a0')).toBe(0);
    expect(['a1', 'a0V', 'Zz', 'a0'].sort(comparePositions)).toEqual(['Zz', 'a0', 'a0V', 'a1']);
  });
});

describe('isValidPosition', () => {
  it('accepts keys produced by the library', () => {
    expect(isValidPosition('a0')).toBe(true);
    expect(isValidPosition('a0V')).toBe(true);
    expect(isValidPosition('Zz')).toBe(true);
  });

  it('rejects malformed keys', () => {
    expect(isValidPosition('')).toBe(false);
    // Integer part too short for its head character.
    expect(isValidPosition('b0')).toBe(false);
    // Trailing zero in the fractional part.
    expect(isValidPosition('a00')).toBe(false);
    // Characters outside base 62.
    expect(isValidPosition('a0!')).toBe(false);
    expect(isValidPosition('a0 ')).toBe(false);
    expect(isValidPosition('a0'.padEnd(200, 'V'))).toBe(false);
  });
});
