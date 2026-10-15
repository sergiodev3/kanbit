import { QueryClient } from '@tanstack/react-query';

/**
 * v1.0 "real time" is polling (spec §12.1): queries refetch on focus and on reconnect.
 * Individual queries opt into `refetchInterval` where needed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
