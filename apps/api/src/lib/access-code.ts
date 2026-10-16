import { randomInt } from 'node:crypto';

/** Uppercase letters and digits without look-alikes: no 0/O, 1/I/L. */
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 6;
const MAX_ATTEMPTS = 5;

/** Returns an integer in [0, max); crypto-random by default. */
export type RandomIndex = (max: number) => number;

/** Crypto-random, dictation-friendly group code such as `K7MPX2` (31^6 ≈ 887M combinations). */
export function generateAccessCode(random: RandomIndex = randomInt): string {
  return Array.from(
    { length: ACCESS_CODE_LENGTH },
    () => ACCESS_CODE_ALPHABET[random(ACCESS_CODE_ALPHABET.length)],
  ).join('');
}

/**
 * Runs `insert` with fresh codes until it succeeds. `insert` returns null when the code
 * collided with an existing group (unique violation) so a new code is drawn.
 */
export async function withUniqueAccessCode<T>(
  insert: (code: string) => Promise<T | null>,
  generate: () => string = generateAccessCode,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await insert(generate());
    if (result !== null) return result;
  }
  throw new Error(`Could not generate a unique access code after ${MAX_ATTEMPTS} attempts`);
}
