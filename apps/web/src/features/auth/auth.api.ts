import {
  MeResponse,
  type ChangePasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type Role,
} from '@kanbit/shared';
import { onlineManager, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiGet, apiPost, isApiError } from '../../lib/api';
import { clearPendingLogout, hasPendingLogout, markPendingLogout, retryPendingLogout } from './pending-logout';

export const ME_QUERY_KEY = ['me'] as const;

/** Landing page per role (spec §3, §8). */
export const homePathFor = (role: Role): string => (role === 'TEACHER' ? '/teacher' : '/team');

/**
 * Current session, or `null` when nobody is logged in (401 is an expected state, not an error).
 * While a logout is pending the cookie is never trusted: the logout is retried and the device
 * stays signed out whatever the outcome, so the next person must log in again.
 */
export async function fetchMe(): Promise<MeResponse | null> {
  if (hasPendingLogout()) {
    await retryPendingLogout();
    return null;
  }
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

/** Retries a pending logout whenever the browser comes back online. */
export function usePendingLogoutRetry(): void {
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online) void retryPendingLogout();
      }),
    [],
  );
}

/**
 * Replaces the session and drops every other cached query so no data leaks between users.
 * An in-flight `/auth/me` is cancelled first so a stale 401 cannot overwrite the new session.
 * A new session comes with a new cookie, so any pending logout of the previous one is obsolete.
 */
async function setSession(client: QueryClient, me: MeResponse | null): Promise<void> {
  if (me) clearPendingLogout();
  await client.cancelQueries({ queryKey: ME_QUERY_KEY });
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_QUERY_KEY[0] });
  client.setQueryData(ME_QUERY_KEY, me);
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      // Revoke the previous user's server session first when its logout is still pending.
      await retryPendingLogout();
      return MeResponse.parse(await apiPost<unknown>('/auth/login', body));
    },
    onSuccess: (me) => setSession(client, me),
  });
}

export function useRegister() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterRequest) => {
      await retryPendingLogout();
      return MeResponse.parse(await apiPost<unknown>('/auth/register', body));
    },
    onSuccess: (me) => setSession(client, me),
  });
}

/**
 * Logging out always ends the local session, even when the request fails: a 401 means the
 * cookie had already expired. On any other failure the cookie may still be valid, so a pending
 * logout is recorded and retried before the session is ever trusted again.
 */
export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await apiPost('/auth/logout');
      } catch (error) {
        if (isApiError(error, 'UNAUTHENTICATED')) clearPendingLogout();
        else markPendingLogout();
        throw error;
      }
      clearPendingLogout();
    },
    onSettled: () => setSession(client, null),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => apiPost('/auth/change-password', body),
  });
}
