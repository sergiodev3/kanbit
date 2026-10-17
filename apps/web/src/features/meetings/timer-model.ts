/** Spec §8.4: the stand-up lasts 15 minutes; the color changes from minute 10 and again from minute 14. */
export const COUNTDOWN_SECONDS = 15 * 60;
export const YELLOW_FROM_SECONDS = 10 * 60;
export const RED_FROM_SECONDS = 14 * 60;

export type TimerPhase = 'GREEN' | 'YELLOW' | 'RED' | 'TIME_UP';

export function timerPhase(elapsedSeconds: number): TimerPhase {
  if (elapsedSeconds >= COUNTDOWN_SECONDS) return 'TIME_UP';
  if (elapsedSeconds >= RED_FROM_SECONDS) return 'RED';
  if (elapsedSeconds >= YELLOW_FROM_SECONDS) return 'YELLOW';
  return 'GREEN';
}

/** Color is never the only signal: each phase also has its own text. */
export const PHASE_LABELS: Record<TimerPhase, string> = {
  GREEN: 'En tiempo',
  YELLOW: 'Últimos 5 minutos',
  RED: 'Último minuto',
  TIME_UP: 'Tiempo',
};

export const remainingSeconds = (elapsedSeconds: number): number =>
  Math.max(0, COUNTDOWN_SECONDS - Math.floor(elapsedSeconds));

/** "MM:SS" of the remaining time, never negative. */
export function formatCountdown(remaining: number): string {
  const total = Math.max(0, Math.floor(remaining));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export type CountdownStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'FINISHED';

export interface CountdownState {
  status: CountdownStatus;
  /** Whole seconds counted so far, 0..900. */
  elapsed: number;
  /** While running: the clock reading (ms) and the elapsed seconds when this run started. */
  anchorMs: number;
  anchorElapsed: number;
}

export const initialCountdown: CountdownState = { status: 'IDLE', elapsed: 0, anchorMs: 0, anchorElapsed: 0 };

export type CountdownAction =
  | { type: 'start'; nowMs: number }
  | { type: 'pause'; nowMs: number }
  | { type: 'tick'; nowMs: number }
  | { type: 'resumeAt'; elapsed: number; nowMs: number }
  | { type: 'reset' };

/** Counts from clock readings (not from the number of ticks), so a throttled background tab catches up. */
function counted(state: CountdownState, nowMs: number): CountdownState {
  const elapsed = Math.min(
    COUNTDOWN_SECONDS,
    state.anchorElapsed + Math.max(0, Math.floor((nowMs - state.anchorMs) / 1000)),
  );
  return { ...state, elapsed, status: elapsed >= COUNTDOWN_SECONDS ? 'FINISHED' : state.status };
}

const runningFrom = (elapsed: number, nowMs: number): CountdownState => {
  const clamped = Math.min(COUNTDOWN_SECONDS, Math.max(0, Math.floor(elapsed)));
  return {
    status: clamped >= COUNTDOWN_SECONDS ? 'FINISHED' : 'RUNNING',
    elapsed: clamped,
    anchorMs: nowMs,
    anchorElapsed: clamped,
  };
};

export function countdownReducer(state: CountdownState, action: CountdownAction): CountdownState {
  switch (action.type) {
    case 'start':
      return state.status === 'IDLE' || state.status === 'PAUSED' ? runningFrom(state.elapsed, action.nowMs) : state;
    case 'tick':
      return state.status === 'RUNNING' ? counted(state, action.nowMs) : state;
    case 'pause': {
      if (state.status !== 'RUNNING') return state;
      const now = counted(state, action.nowMs);
      return now.status === 'FINISHED' ? now : { ...now, status: 'PAUSED' };
    }
    case 'resumeAt':
      return state.status === 'IDLE' ? runningFrom(action.elapsed, action.nowMs) : state;
    case 'reset':
      return initialCountdown;
  }
}
