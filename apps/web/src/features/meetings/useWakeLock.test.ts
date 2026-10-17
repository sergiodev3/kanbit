import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

interface FakeSentinel {
  released: boolean;
  release: ReturnType<typeof vi.fn>;
}

function stubWakeLock(request?: () => Promise<FakeSentinel>) {
  const sentinels: FakeSentinel[] = [];
  const requestMock = vi.fn(async (_type: string) => {
    if (request) return request();
    const sentinel: FakeSentinel = {
      released: false,
      release: vi.fn(async () => {
        sentinel.released = true;
      }),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: requestMock }, configurable: true });
  return { requestMock, sentinels };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useWakeLock', () => {
  it('asks for a screen lock while mounted and releases it on unmount', async () => {
    const { requestMock, sentinels } = stubWakeLock();

    const { unmount } = renderHook(() => useWakeLock());

    await waitFor(() => expect(requestMock).toHaveBeenCalledWith('screen'));
    await waitFor(() => expect(sentinels).toHaveLength(1));
    unmount();
    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1);
  });

  it('asks again when the tab becomes visible after the browser released the lock', async () => {
    const { requestMock, sentinels } = stubWakeLock();
    renderHook(() => useWakeLock());
    await waitFor(() => expect(sentinels).toHaveLength(1));

    (sentinels[0] as FakeSentinel).released = true;
    setVisibility('hidden');
    setVisibility('visible');

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
  });

  it('does not ask again while it still holds the lock', async () => {
    const { requestMock, sentinels } = stubWakeLock();
    renderHook(() => useWakeLock());
    await waitFor(() => expect(sentinels).toHaveLength(1));

    setVisibility('visible');

    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('releases a lock that arrives after the page was already left', async () => {
    let resolve: (sentinel: FakeSentinel) => void = () => undefined;
    const late: FakeSentinel = { released: false, release: vi.fn(async () => undefined) };
    const { requestMock } = stubWakeLock(() => new Promise<FakeSentinel>((done) => (resolve = done)));
    const { unmount } = renderHook(() => useWakeLock());
    await waitFor(() => expect(requestMock).toHaveBeenCalled());

    unmount();
    resolve(late);

    await waitFor(() => expect(late.release).toHaveBeenCalledTimes(1));
  });

  it('does nothing and throws nothing when the API is missing', () => {
    expect('wakeLock' in navigator).toBe(false);

    const { unmount } = renderHook(() => useWakeLock());

    expect(() => unmount()).not.toThrow();
  });

  it('survives a refused request', async () => {
    const { requestMock } = stubWakeLock(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));

    const { unmount } = renderHook(() => useWakeLock());

    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    expect(() => unmount()).not.toThrow();
  });
});
