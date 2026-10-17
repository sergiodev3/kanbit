import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('stays at zero until started', () => {
    const { result } = renderHook(() => useCountdown());

    act(() => void vi.advanceTimersByTime(5000));

    expect(result.current).toMatchObject({ status: 'IDLE', elapsed: 0 });
  });

  it('counts once per second after start', () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(3000));

    expect(result.current).toMatchObject({ status: 'RUNNING', elapsed: 3 });
  });

  it('stops counting while paused and goes on after starting again', () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(4000));
    act(() => result.current.pause());
    act(() => void vi.advanceTimersByTime(20_000));
    expect(result.current).toMatchObject({ status: 'PAUSED', elapsed: 4 });

    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toMatchObject({ status: 'RUNNING', elapsed: 6 });
  });

  it('goes back to idle at zero on reset', () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(7000));
    act(() => result.current.reset());
    act(() => void vi.advanceTimersByTime(3000));

    expect(result.current).toMatchObject({ status: 'IDLE', elapsed: 0 });
  });

  it('finishes at 15:00 and stops counting', () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(905_000));

    expect(result.current).toMatchObject({ status: 'FINISHED', elapsed: 900 });
  });

  it('resumes from an elapsed time, as after a page reload mid-meeting', () => {
    const { result } = renderHook(() => useCountdown());

    act(() => result.current.resumeAt(125));
    act(() => void vi.advanceTimersByTime(2000));

    expect(result.current).toMatchObject({ status: 'RUNNING', elapsed: 127 });
  });

  it('stops its interval on unmount', () => {
    const { result, unmount } = renderHook(() => useCountdown());
    act(() => result.current.start());

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
