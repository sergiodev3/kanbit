import type { MeetingResponse } from '@kanbit/shared';
import { useEffect, useRef } from 'react';
import { errorMessage } from '../../lib/error-messages';
import { useMediaQuery } from '../../shared/ui/useIsNarrow';
import { useEndMeeting, useStartMeeting } from './meetings.api';
import { formatDuration } from './meetings-model';
import {
  COUNTDOWN_SECONDS,
  formatCountdown,
  PHASE_LABELS,
  remainingSeconds,
  timerPhase,
  type CountdownStatus,
  type TimerPhase,
} from './timer-model';
import { useCountdown } from './useCountdown';

export interface ProjectionTimerProps {
  teamId: string;
  meeting: MeetingResponse;
  /** The moderator or the teacher: they start, pause, reset and end. Everyone else only watches. */
  canManage: boolean;
  online: boolean;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const PHASE_TEXT: Record<TimerPhase, string> = {
  GREEN: 'text-emerald-400',
  YELLOW: 'text-amber-300',
  RED: 'text-red-400',
  TIME_UP: 'text-red-400',
};

const PHASE_RING: Record<TimerPhase, string> = {
  GREEN: 'ring-emerald-400',
  YELLOW: 'ring-amber-300',
  RED: 'ring-red-400',
  TIME_UP: 'ring-red-400',
};

const button =
  'rounded-2xl px-8 py-4 text-2xl font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-white disabled:opacity-50';
const primary = `${button} bg-white text-slate-950 hover:bg-slate-200`;
const secondary = `${button} bg-slate-800 text-white ring-2 ring-slate-400 hover:bg-slate-700`;

function stateLabel(status: CountdownStatus, phase: TimerPhase): string {
  if (status === 'IDLE') return 'Sin iniciar';
  return status === 'PAUSED' ? `${PHASE_LABELS[phase]} · En pausa` : PHASE_LABELS[phase];
}

/** Spec §8.4: the giant 15:00 countdown with its phase colors and the start / pause / reset / end controls. */
export function ProjectionTimer({ teamId, meeting, canManage, online }: ProjectionTimerProps) {
  const countdown = useCountdown();
  const start = useStartMeeting(teamId);
  const end = useEndMeeting(teamId);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const resumed = useRef(false);
  const ended = meeting.endedAt !== null;
  const { resumeAt } = countdown;

  // A meeting that is already running (page reload, or the viewer opened the projection late) picks the countdown up
  // from the server's `startedAt`. The elapsed time is measured against the DEVICE clock, so this is only a display
  // aid: a skewed device clock shows a skewed timer, while the saved start, end and duration stay the server's.
  useEffect(() => {
    if (resumed.current || ended || !meeting.startedAt) return;
    resumed.current = true;
    resumeAt((Date.now() - Date.parse(meeting.startedAt)) / 1000);
  }, [ended, meeting.startedAt, resumeAt]);

  // An ended meeting stays on "Tiempo" whatever the local countdown said.
  const elapsed = ended ? COUNTDOWN_SECONDS : countdown.elapsed;
  const phase = timerPhase(elapsed);
  const blinking = phase === 'TIME_UP' && !ended && !reducedMotion;
  const failed = start.isError ? start.error : end.isError ? end.error : null;

  const begin = () => {
    if (meeting.startedAt) {
      countdown.start();
      return;
    }
    // The server start comes first; the local countdown follows, and must not also resume from the new `startedAt`.
    resumed.current = true;
    start.mutate(meeting.id, { onSuccess: () => countdown.start() });
  };

  return (
    <section aria-label="Cronómetro" className="space-y-4 text-center">
      <div
        data-testid="countdown"
        data-phase={phase}
        data-blinking={String(blinking)}
        className={`rounded-3xl bg-black px-4 py-6 ring-8 ${PHASE_RING[phase]} ${PHASE_TEXT[phase]} ${
          blinking ? 'animate-pulse' : ''
        }`}
      >
        <p role="timer" aria-label="Tiempo restante" className="text-[22vw] leading-none font-black tabular-nums">
          {formatCountdown(remainingSeconds(elapsed))}
        </p>
        <p data-testid="phase-label" className="mt-2 text-4xl font-bold">
          {ended ? PHASE_LABELS.TIME_UP : stateLabel(countdown.status, phase)}
        </p>
      </div>

      {ended && (
        <div className="space-y-1 text-3xl font-semibold">
          <p>Reunión terminada</p>
          {meeting.durationSeconds !== null && <p>{`Duración: ${formatDuration(meeting.durationSeconds)}`}</p>}
        </div>
      )}

      {failed && (
        <p role="alert" className="rounded-xl bg-red-950 p-3 text-xl font-semibold text-red-100 ring-2 ring-red-400">
          {errorMessage(failed)}
        </p>
      )}

      {canManage && !ended && (
        <div className="flex flex-wrap justify-center gap-4">
          {countdown.status === 'RUNNING' && (
            <button type="button" onClick={countdown.pause} className={primary}>
              Pausar
            </button>
          )}
          {(countdown.status === 'IDLE' || countdown.status === 'PAUSED') && (
            <button
              type="button"
              disabled={start.isPending || (!meeting.startedAt && !online)}
              onClick={begin}
              className={primary}
            >
              {countdown.status === 'PAUSED' ? 'Reanudar' : 'Iniciar'}
            </button>
          )}
          {countdown.status !== 'IDLE' && (
            <button type="button" onClick={countdown.reset} className={secondary}>
              Reiniciar
            </button>
          )}
          {meeting.startedAt && (
            <button
              type="button"
              disabled={!online || end.isPending}
              onClick={() => end.mutate(meeting.id)}
              className={secondary}
            >
              Terminar reunión
            </button>
          )}
        </div>
      )}
    </section>
  );
}
