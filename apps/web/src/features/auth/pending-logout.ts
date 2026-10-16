import { apiPost, isApiError } from '../../lib/api';

/**
 * A logout the server never confirmed (spec §5.3.1 offline). The HttpOnly session cookie may
 * still be valid, so on a shared classroom device the client must not trust `/auth/me` until
 * `POST /auth/logout` finally reaches the server.
 */
const STORAGE_KEY = 'kanbit.pendingLogout';

/** Used only when storage is unavailable, so the marker still holds for this page's lifetime. */
let memoryMarker = false;
let inFlight: Promise<void> | null = null;

export function markPendingLogout(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    memoryMarker = true;
  }
}

export function clearPendingLogout(): void {
  memoryMarker = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the in-memory marker was already cleared.
  }
}

export function hasPendingLogout(): boolean {
  if (memoryMarker) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** True when the server confirmed the session is gone: a 2xx, or a 401 for an expired cookie. */
async function sendLogout(): Promise<boolean> {
  try {
    await apiPost('/auth/logout');
    return true;
  } catch (error) {
    return isApiError(error, 'UNAUTHENTICATED');
  }
}

/**
 * Retries a pending logout and clears the marker once the server confirms it. Never throws;
 * concurrent callers share one request.
 */
export function retryPendingLogout(): Promise<void> {
  if (!hasPendingLogout()) return Promise.resolve();
  inFlight ??= sendLogout()
    .then((confirmed) => {
      if (confirmed) clearPendingLogout();
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
