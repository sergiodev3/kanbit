import { apiFetch, isApiError } from '../../lib/api';

/**
 * A logout the server never confirmed (spec §5.3.1 offline). The HttpOnly session cookie may
 * still be valid, so on a shared classroom device the client must not trust `/auth/me` until
 * `POST /auth/logout` finally reaches the server.
 */
const STORAGE_KEY = 'kanbit.pendingLogout';
/** Login and register wait for the retry, so a hanging network must not block them for long. */
const DEFAULT_TIMEOUT_MS = 5000;

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
async function confirmLogout(signal: AbortSignal): Promise<boolean> {
  try {
    await apiFetch('/auth/logout', { method: 'POST', signal });
    return true;
  } catch (error) {
    return isApiError(error, 'UNAUTHENTICATED');
  }
}

/** Gives up (unconfirmed) after `timeoutMs`, aborting the request so the marker stays for a later retry. */
async function sendLogout(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });
  try {
    return await Promise.race([confirmLogout(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retries a pending logout and clears the marker once the server confirms it. Never throws and
 * never waits longer than `timeoutMs`; concurrent callers share one request.
 */
export function retryPendingLogout({ timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<void> {
  if (!hasPendingLogout()) return Promise.resolve();
  inFlight ??= sendLogout(timeoutMs)
    .then((confirmed) => {
      if (confirmed) clearPendingLogout();
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
