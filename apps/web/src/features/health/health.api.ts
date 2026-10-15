import { HealthResponse } from '@kanbit/shared';
import { ApiError, apiFetch } from '../../lib/api';

/** Returns the health payload; a 503 still carries a valid body (`db: 'down'`). */
export async function fetchHealth(): Promise<HealthResponse> {
  try {
    return HealthResponse.parse(await apiFetch<unknown>('/health'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) {
      const degraded = HealthResponse.safeParse(error.body);
      if (degraded.success) return degraded.data;
    }
    throw error;
  }
}
