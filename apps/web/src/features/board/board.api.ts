import type {
  BoardResponse,
  CardResponse,
  CreateCardRequest,
  MoveCardRequest,
  UpdateCardRequest,
} from '@kanbit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import { applyMove } from './board-dnd';

/** v1.0 "real time" is polling (spec §12.1): every 10 s, plus the client-wide focus/reconnect refetch. */
export const BOARD_REFETCH_INTERVAL_MS = 10_000;

export const boardKeys = {
  team: (teamId: string) => ['teams', teamId, 'board'] as const,
};

/** `paused` stops the polling, e.g. while a card is being dragged, so a refetch never reshuffles the board under it. */
export function useBoard(teamId: string, { paused = false }: { paused?: boolean } = {}) {
  return useQuery({
    queryKey: boardKeys.team(teamId),
    queryFn: () => apiGet<BoardResponse>(`/teams/${teamId}/board`),
    refetchInterval: paused ? false : BOARD_REFETCH_INTERVAL_MS,
  });
}

/**
 * Every card write refetches the board when it settles, success or failure: a 409 `CARD_CONFLICT` means the
 * board the user saw is stale, so the reload is what lets them retry on fresh data. Sprint writes reuse it.
 */
export function useBoardMutation<TVariables, TResult>(teamId: string, mutationFn: (variables: TVariables) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => client.invalidateQueries({ queryKey: boardKeys.team(teamId) }),
  });
}

/**
 * The caller generates `id` once per form (spec §5.3.1), so retrying after a network failure re-sends the same id
 * and the API answers 200 with the card it may already have created.
 */
export const useCreateCard = (teamId: string) =>
  useBoardMutation(teamId, (body: CreateCardRequest) => apiPost<CardResponse>(`/teams/${teamId}/cards`, body));

export type UpdateCardVariables = UpdateCardRequest & { cardId: string };

export const useUpdateCard = (teamId: string) =>
  useBoardMutation(teamId, ({ cardId, ...body }: UpdateCardVariables) =>
    apiPatch<CardResponse>(`/cards/${cardId}`, body),
  );

export const useDeleteCard = (teamId: string) =>
  useBoardMutation(teamId, (cardId: string) => apiDelete(`/cards/${cardId}`));

export type MoveCardVariables = MoveCardRequest & { cardId: string };

/**
 * Optimistic move: the board cache shows the card in its target cell at once (in-flight refetches are cancelled so
 * they cannot overwrite it), is restored if the server refuses, and is refetched when the move settles.
 */
export function useMoveCard(teamId: string) {
  const client = useQueryClient();
  const queryKey = boardKeys.team(teamId);
  return useMutation({
    mutationFn: ({ cardId, ...body }: MoveCardVariables) => apiPost<CardResponse>(`/cards/${cardId}/move`, body),
    onMutate: async (move: MoveCardVariables) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<BoardResponse>(queryKey);
      if (previous) client.setQueryData(queryKey, applyMove(previous, move));
      return { previous };
    },
    onError: (_error, _move, snapshot) => {
      if (snapshot?.previous) client.setQueryData(queryKey, snapshot.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
}
