import { describe, expect, it } from 'vitest';
import { ME_QUERY_KEY } from '../features/auth/auth.api';
import { ApiError } from '../lib/api';
import { meFixture } from '../test/utils';
import { createQueryClient } from './query-client';

describe('createQueryClient', () => {
  it('clears the session when any query answers 401 UNAUTHENTICATED', async () => {
    const client = createQueryClient();
    client.setQueryData(ME_QUERY_KEY, meFixture('TEACHER'));

    await client
      .fetchQuery({
        queryKey: ['groups'],
        queryFn: () => Promise.reject(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required')),
        retry: false,
      })
      .catch(() => undefined);

    expect(client.getQueryData(ME_QUERY_KEY)).toBeNull();
  });

  it('keeps the session on other errors', async () => {
    const client = createQueryClient();
    const me = meFixture('TEACHER');
    client.setQueryData(ME_QUERY_KEY, me);

    await client
      .fetchQuery({
        queryKey: ['groups'],
        queryFn: () => Promise.reject(new ApiError(403, 'FORBIDDEN', 'Forbidden')),
        retry: false,
      })
      .catch(() => undefined);

    expect(client.getQueryData(ME_QUERY_KEY)).toEqual(me);
  });
});
