import { AccessCode } from '@kanbit/shared';
import { describe, expect, it } from 'vitest';
import { ACCESS_CODE_ALPHABET, generateAccessCode, withUniqueAccessCode } from '../src/lib/access-code';

describe('generateAccessCode', () => {
  it('produces 6 uppercase characters without look-alikes (0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toMatch(/[01OIL]/);
      // Already in the shape students' input is normalised to.
      expect(AccessCode.parse(code)).toBe(code);
    }
  });

  it('draws every character from the readable alphabet using the given random source', () => {
    expect(ACCESS_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    const picks = [0, 1, 2, 3, 30, 22];
    expect(generateAccessCode(() => picks.shift() ?? 0)).toBe('ABCD9Z');
  });
});

describe('withUniqueAccessCode', () => {
  it('retries with a fresh code until the insert is not a collision', async () => {
    const codes = ['AAAAAA', 'BBBBBB', 'CCCCCC'];
    const tried: string[] = [];

    const result = await withUniqueAccessCode(
      async (code) => {
        tried.push(code);
        return code === 'CCCCCC' ? { code } : null;
      },
      () => codes.shift() ?? 'ZZZZZZ',
    );

    expect(result).toEqual({ code: 'CCCCCC' });
    expect(tried).toEqual(['AAAAAA', 'BBBBBB', 'CCCCCC']);
  });

  it('gives up after a bounded number of collisions', async () => {
    let attempts = 0;
    const insert = async () => {
      attempts++;
      return null;
    };

    await expect(withUniqueAccessCode(insert)).rejects.toThrow(/access code/i);
    expect(attempts).toBe(5);
  });
});
