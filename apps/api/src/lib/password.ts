import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** argon2id with the library defaults (OWASP minimum: m=19 MiB, t=2, p=1). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** Never throws: a malformed or foreign hash simply does not match. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Lowercase letters and digits without look-alikes (0/o, 1/l, i is kept: no I in lowercase).
const READABLE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

/** Crypto-random, dictation-friendly password such as `k7mp-x2qa-9fhr` (~60 bits). */
export function generateTemporaryPassword(): string {
  const chunk = () =>
    Array.from({ length: 4 }, () => READABLE_ALPHABET[randomInt(READABLE_ALPHABET.length)]).join('');
  return `${chunk()}-${chunk()}-${chunk()}`;
}
