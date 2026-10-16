import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, meFixture, mockApi, unauthenticated } from '../../test/utils';
import { fetchMe } from './auth.api';
import { clearPendingLogout, hasPendingLogout, markPendingLogout, retryPendingLogout } from './pending-logout';

const networkError = (): Response => {
  throw new TypeError('Failed to fetch');
};

const callsTo = (fetchMock: ReturnType<typeof mockApi>, path: string) =>
  fetchMock.mock.calls.filter(([input]) => String(input).endsWith(path)).length;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearPendingLogout();
  localStorage.clear();
});

describe('pending logout', () => {
  it('survives a reload by living in localStorage', () => {
    markPendingLogout();

    expect(hasPendingLogout()).toBe(true);
    expect(localStorage.length).toBe(1);

    clearPendingLogout();
    expect(hasPendingLogout()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('never trusts /auth/me while the logout is still pending offline', async () => {
    const fetchMock = mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': networkError,
    });
    markPendingLogout();

    await expect(fetchMe()).resolves.toBeNull();

    expect(callsTo(fetchMock, '/auth/me')).toBe(0);
    expect(callsTo(fetchMock, '/auth/logout')).toBe(1);
    expect(hasPendingLogout()).toBe(true);
  });

  it.each([
    ['succeeds', () => new Response(null, { status: 204 })],
    ['answers 401', unauthenticated],
  ] as const)('clears the marker when the retried logout %s', async (_case, logoutHandler) => {
    const fetchMock = mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': logoutHandler,
    });
    markPendingLogout();

    await expect(fetchMe()).resolves.toBeNull();
    expect(hasPendingLogout()).toBe(false);

    // With the marker gone, the next check trusts the server again.
    await expect(fetchMe()).resolves.toEqual(meFixture('TEACHER'));
    expect(callsTo(fetchMock, '/auth/logout')).toBe(1);
  });

  it('keeps the marker when the server fails', async () => {
    mockApi({ 'POST /auth/logout': () => jsonResponse(503, { error: { code: 'DOWN', message: 'down' } }) });
    markPendingLogout();

    await retryPendingLogout();

    expect(hasPendingLogout()).toBe(true);
  });

  it('sends a single request for concurrent retries', async () => {
    const fetchMock = mockApi({ 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    markPendingLogout();

    await Promise.all([retryPendingLogout(), retryPendingLogout(), fetchMe()]);

    expect(callsTo(fetchMock, '/auth/logout')).toBe(1);
    expect(hasPendingLogout()).toBe(false);
  });

  it('gives up after the timeout when the retried logout hangs, keeping the marker', async () => {
    mockApi({ 'POST /auth/logout': () => new Promise<Response>(() => {}) });
    markPendingLogout();

    await retryPendingLogout({ timeoutMs: 20 });

    expect(hasPendingLogout()).toBe(true);
  });

  it('does nothing when no logout is pending', async () => {
    const fetchMock = mockApi({});

    await retryPendingLogout();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to an in-memory marker when storage is unavailable', async () => {
    const blocked = () => {
      throw new DOMException('Storage disabled', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    mockApi({
      'GET /auth/me': () => jsonResponse(200, meFixture('TEACHER')),
      'POST /auth/logout': networkError,
    });

    expect(() => markPendingLogout()).not.toThrow();
    expect(hasPendingLogout()).toBe(true);
    await expect(fetchMe()).resolves.toBeNull();

    expect(() => clearPendingLogout()).not.toThrow();
    expect(hasPendingLogout()).toBe(false);
  });
});
