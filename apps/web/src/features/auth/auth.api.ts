import {
  MeResponse,
  type ChangePasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type Role,
} from '@kanbit/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, isApiError } from '../../lib/api';

export const ME_QUERY_KEY = ['me'] as const;

/** Landing page per role (spec §3, §8). */
export const homePathFor = (role: Role): string => (role === 'TEACHER' ? '/teacher' : '/team');

/** Current session, or `null` when nobody is logged in (401 is an expected state, not an error). */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return MeResponse.parse(await apiGet<unknown>('/auth/me'));
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) return null;
    throw error;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe });
}

/**
 * Replaces the session and drops every other cached query so no data leaks between users.
 * An in-flight `/auth/me` is cancelled first so a stale 401 cannot overwrite the new session.
 */
async function setSession(client: QueryClient, me: MeResponse | null): Promise<void> {
  await client.cancelQueries({ queryKey: ME_QUERY_KEY });
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] });
  client.setQueryData(ME_QUERY_KEY, me);
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginRequest) => MeResponse.parse(await apiPost<unknown>('/auth/login', body)),
    onSuccess: (me) => setSession(client, me),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterRequest) => MeResponse.parse(await apiPost<unknown>('/auth/register', body)),
    onSuccess: (me) => setSession(client, me),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/auth/logout'),
    onSuccess: () => setSession(client, null),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => apiPost('/auth/change-password', body),
  });
}
