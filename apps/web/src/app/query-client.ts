import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ME_QUERY_KEY } from '../features/auth/auth.api';
import { ApiError, isApiError } from '../lib/api';

/**
 * v1.0 "real time" is polling (spec §12.1): queries refetch on focus and on reconnect.
 * Individual queries opt into `refetchInterval` where needed.
 *
 * A 401 `UNAUTHENTICATED` from any request means the session cookie expired: the cached
 * session is cleared so the route guards send the user back to the login page.
 */
export function createQueryClient(): QueryClient {
  const onError = (error: unknown) => {
    if (isApiError(error, 'UNAUTHENTICATED')) client.setQueryData(ME_QUERY_KEY, null);
  };

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        // Client errors (4xx) are deterministic; only network and server errors are retried.
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });
  return client;
}

export const queryClient = createQueryClient();
