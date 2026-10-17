import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_SECONDS,
  countdownReducer,
  formatCountdown,
  initialCountdown,
  PHASE_LABELS,
  remainingSeconds,
  timerPhase,
  type CountdownAction,
  type CountdownState,
} from './timer-model';

const run = (actions: CountdownAction[], from: CountdownState = initialCountdown): CountdownState =>
  actions.reduce(countdownReducer, from);

describe('timerPhase', () => {
  it('lasts 15 minutes', () => {
    expect(COUNTDOWN_SECONDS).toBe(900);
  });

  it.each([
    [0, 'GREEN'],
    [599, 'GREEN'],
    [600, 'YELLOW'],
    [839, 'YELLOW'],
    [840, 'RED'],
    [899, 'RED'],
    [900, 'TIME_UP'],
    [1200, 'TIME_UP'],
  ] as const)('is %i s elapsed -> %s', (elapsed, phase) => {
    expect(timerPhase(elapsed)).toBe(phase);
  });

  it('never relies on color alone: every phase has its own text label', () => {
    expect(PHASE_LABELS).toEqual({
      GREEN: 'En tiempo',
      YELLOW: 'Últimos 5 minutos',
      RED: 'Último minuto',
      TIME_UP: 'Tiempo',
    });
  });
});

describe('formatCountdown', () => {
  it.each([
    [900, '15:00'],
    [899, '14:59'],
    [61, '01:01'],
    [60, '01:00'],
    [9, '00:09'],
    [0, '00:00'],
    [-4, '00:00'],
  ])('shows %i s remaining as %s', (remaining, text) => {
    expect(formatCountdown(remaining)).toBe(text);
  });

  it('derives the remaining seconds from the elapsed ones and never goes below zero', () => {
    expect(remainingSeconds(0)).toBe(900);
    expect(remainingSeconds(125)).toBe(775);
    expect(remainingSeconds(900)).toBe(0);
    expect(remainingSeconds(1500)).toBe(0);
  });
});

describe('countdownReducer', () => {
  it('starts idle at zero', () => {
    expect(initialCountdown).toMatchObject({ status: 'IDLE', elapsed: 0 });
  });

  it('counts the whole seconds since the run started', () => {
    const state = run([
      { type: 'start', nowMs: 10_000 },
      { type: 'tick', nowMs: 13_400 },
    ]);

    expect(state).toMatchObject({ status: 'RUNNING', elapsed: 3 });
  });

  it('keeps the elapsed time while paused and ignores ticks', () => {
    const state = run([
      { type: 'start', nowMs: 0 },
      { type: 'pause', nowMs: 5_000 },
      { type: 'tick', nowMs: 20_000 },
    ]);

    expect(state).toMatchObject({ status: 'PAUSED', elapsed: 5 });
  });

  it('continues from the paused time when started again', () => {
    const state = run([
      { type: 'start', nowMs: 0 },
      { type: 'pause', nowMs: 5_000 },
      { type: 'start', nowMs: 50_000 },
      { type: 'tick', nowMs: 52_000 },
    ]);

    expect(state).toMatchObject({ status: 'RUNNING', elapsed: 7 });
  });

  it('resets to idle at zero', () => {
    const state = run([{ type: 'start', nowMs: 0 }, { type: 'tick', nowMs: 30_000 }, { type: 'reset' }]);

    expect(state).toEqual(initialCountdown);
  });

  it('finishes at 15:00 and stays there', () => {
    const state = run([
      { type: 'start', nowMs: 0 },
      { type: 'tick', nowMs: 901_000 },
      { type: 'tick', nowMs: 960_000 },
    ]);

    expect(state).toMatchObject({ status: 'FINISHED', elapsed: 900 });
  });

  it('does not restart a finished countdown', () => {
    const finished = run([{ type: 'start', nowMs: 0 }, { type: 'tick', nowMs: 900_000 }]);

    expect(countdownReducer(finished, { type: 'start', nowMs: 1_000_000 })).toBe(finished);
  });

  it('ignores a second start while running', () => {
    const running = run([{ type: 'start', nowMs: 0 }]);

    expect(countdownReducer(running, { type: 'start', nowMs: 9_000 })).toBe(running);
  });

  it('resumes at the elapsed time of a meeting that was already running', () => {
    const state = run([{ type: 'resumeAt', elapsed: 600, nowMs: 100_000 }, { type: 'tick', nowMs: 102_000 }]);

    expect(state).toMatchObject({ status: 'RUNNING', elapsed: 602 });
  });

  it('resumes straight into the finished state past 15 minutes and clamps a future start to zero', () => {
    expect(run([{ type: 'resumeAt', elapsed: 4000, nowMs: 0 }])).toMatchObject({ status: 'FINISHED', elapsed: 900 });
    expect(run([{ type: 'resumeAt', elapsed: -30, nowMs: 0 }])).toMatchObject({ status: 'RUNNING', elapsed: 0 });
  });
});
