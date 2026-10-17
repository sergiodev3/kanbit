import { useCallback, useEffect, useReducer } from 'react';
import { countdownReducer, initialCountdown } from './timer-model';

const TICK_MS = 1000;

/**
 * The projection's 15:00 countdown. `Date.now()` is the device clock and is used ONLY to show the timer: it counts
 * elapsed seconds between clicks. The saved meeting times and duration come from the server (start/end endpoints).
 */
export function useCountdown() {
  const [state, dispatch] = useReducer(countdownReducer, initialCountdown);

  useEffect(() => {
    if (state.status !== 'RUNNING') return;
    const id = setInterval(() => dispatch({ type: 'tick', nowMs: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [state.status]);

  const start = useCallback(() => dispatch({ type: 'start', nowMs: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: 'pause', nowMs: Date.now() }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const resumeAt = useCallback((elapsed: number) => dispatch({ type: 'resumeAt', elapsed, nowMs: Date.now() }), []);

  return { status: state.status, elapsed: state.elapsed, start, pause, reset, resumeAt };
}
