import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../src/lib/password';

describe('password hashing', () => {
  it('verifies the original password against its hash and rejects others', async () => {
    const hash = await hashPassword('correct horse');

    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword(hash, 'correct horse')).toBe(true);
    expect(await verifyPassword(hash, 'wrong horse')).toBe(false);
  });

  it('returns false instead of throwing for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('produces readable passwords without ambiguous characters', () => {
    const password = generateTemporaryPassword();

    expect(password).toMatch(/^[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}$/);
    expect(password).not.toMatch(/[01lo]/);
  });

  it('is random on every call', () => {
    const samples = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(samples.size).toBe(50);
  });
});
