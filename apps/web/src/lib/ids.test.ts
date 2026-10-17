import { cuid2Id } from '@kanbit/shared';
import { describe, expect, it } from 'vitest';
import { newId } from './ids';

describe('newId', () => {
  it('generates distinct ids the API accepts as cuid2', () => {
    const first = newId();
    const second = newId();

    expect(cuid2Id.safeParse(first).success).toBe(true);
    expect(first).not.toBe(second);
  });
});
