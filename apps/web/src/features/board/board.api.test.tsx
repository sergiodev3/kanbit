import type { BoardResponse } from '@kanbit/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client';
import { boardFixture, STUDENT_ID } from '../../test/board-fixtures';
import { errorResponse, jsonResponse, mockApi } from '../../test/utils';
import { boardKeys, useBoard, useMoveCard } from './board.api';

const KEY = boardKeys.team('t1');

function setup(initial: BoardResponse | null = boardFixture()) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  if (initial) client.setQueryData(KEY, initial);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

/** A response the test releases when it wants, to observe the optimistic state in between. */
function deferred() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const cardOf = (client: ReturnType<typeof setup>['client'], id: string) =>
  client.getQueryData<BoardResponse>(KEY)?.cards.find((card) => card.id === id);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useMoveCard', () => {
  const move = { cardId: 'cmine', status: 'DOING' as const, assigneeId: STUDENT_ID, position: 'a0' };

  it('moves the card in the board cache before the server answers', async () => {
    const response = deferred();
    const fetchMock = mockApi({
      'POST /cards/cmine/move': () => response.promise,
      'GET /teams/t1/board': () => jsonResponse(200, boardFixture()),
    });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMoveCard('t1'), { wrapper });

    act(() => result.current.mutate(move));

    await waitFor(() => expect(cardOf(client, 'cmine')).toMatchObject({ status: 'DOING', position: 'a0' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    response.resolve(jsonResponse(200, { ...cardOf(client, 'cmine') }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the board back and exposes the error when the server refuses', async () => {
    const response = deferred();
    mockApi({
      'POST /cards/cmine/move': () => response.promise,
      // The settle refetch never answers, so the cache shows exactly what the rollback restored.
      'GET /teams/t1/board': () => new Promise<Response>(() => undefined),
    });
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useMoveCard('t1'), { wrapper });

    act(() => result.current.mutate(move));
    await waitFor(() => expect(cardOf(client, 'cmine')?.status).toBe('DOING'));
    response.resolve(errorResponse(403, 'FORBIDDEN'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(cardOf(client, 'cmine')).toMatchObject({ status: 'TODO', position: 'a0', assigneeId: STUDENT_ID });
  });

  it('refetches the board when the move settles', async () => {
    const fetchMock = mockApi({
      'POST /cards/cmine/move': () => errorResponse(409, 'CARD_CONFLICT'),
      'GET /teams/t1/board': () => jsonResponse(200, boardFixture()),
    });
    const { wrapper } = setup();
    renderHook(() => useBoard('t1'), { wrapper });
    const { result } = renderHook(() => useMoveCard('t1'), { wrapper });

    act(() => result.current.mutate(move));

    await waitFor(() => expect(result.current.isError).toBe(true));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/teams/t1/board'))).toBe(true),
    );
  });
});

describe('useBoard', () => {
  it('stops polling while paused (a drag is in progress)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockApi({ 'GET /teams/t1/board': () => jsonResponse(200, boardFixture()) });
    const { wrapper } = setup(null);
    const boardCalls = () => fetchMock.mock.calls.length;

    const { result } = renderHook(() => useBoard('t1', { paused: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(boardCalls()).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(25_000));

    expect(boardCalls()).toBe(1);
  });
});
