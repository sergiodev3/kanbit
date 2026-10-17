import type { MeetingResponse, MeetingType } from '@kanbit/shared';
import { errorMessage } from '../../lib/error-messages';
import { ErrorSummary } from '../../shared/forms/FormParts';
import { primaryButton } from '../../shared/ui/buttons';
import { useCreateMeeting, useEndMeeting, useStartMeeting } from './meetings.api';
import { formatDuration, NO_MEETING_MESSAGES, type NoMeetingReason } from './meetings-model';

export interface MeetingControlsProps {
  teamId: string;
  meeting: MeetingResponse | null;
  /** The type the server suggests for today; null when no meeting is possible. */
  suggestedType: MeetingType | null;
  /** Why no meeting is possible today, when `suggestedType` is null. */
  reason: NoMeetingReason | null;
  /** The moderator or the teacher: they open, start and end the meeting. */
  canManage: boolean;
  online: boolean;
}

const meetingState = (meeting: MeetingResponse): string => {
  if (meeting.endedAt) return 'Terminada';
  return meeting.startedAt ? 'En curso' : 'Sin iniciar';
};

/** Create, start and end the day's meeting (spec §8.4); everyone else sees only its state. */
export function MeetingControls({ teamId, meeting, suggestedType, reason, canManage, online }: MeetingControlsProps) {
  const create = useCreateMeeting(teamId);
  const start = useStartMeeting(teamId);
  const end = useEndMeeting(teamId);
  const failed = [create, start, end].find((mutation) => mutation.isError);
  const pending = create.isPending || start.isPending || end.isPending;

  const errors = <ErrorSummary messages={failed ? [errorMessage(failed.error)] : []} />;

  if (!meeting) {
    if (!suggestedType) {
      return reason ? <p className="text-slate-700">{NO_MEETING_MESSAGES[reason]}</p> : null;
    }
    if (!canManage) {
      return <p className="text-slate-700">Todavía no hay reunión de hoy. El moderador la creará.</p>;
    }
    return (
      <div className="space-y-2">
        {errors}
        <button type="button" disabled={!online || pending} onClick={() => create.mutate()} className={primaryButton}>
          {create.isPending ? 'Creando…' : 'Crear reunión de hoy'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errors}
      <p className="font-semibold text-slate-800">{`Estado: ${meetingState(meeting)}`}</p>
      {meeting.endedAt && meeting.durationSeconds !== null && (
        <p className="text-slate-700">{`Duración: ${formatDuration(meeting.durationSeconds)}`}</p>
      )}
      {canManage && !meeting.startedAt && (
        <button
          type="button"
          disabled={!online || pending}
          onClick={() => start.mutate(meeting.id)}
          className={primaryButton}
        >
          {start.isPending ? 'Iniciando…' : 'Iniciar reunión'}
        </button>
      )}
      {canManage && meeting.startedAt && !meeting.endedAt && (
        <button
          type="button"
          disabled={!online || pending}
          onClick={() => end.mutate(meeting.id)}
          className={primaryButton}
        >
          {end.isPending ? 'Terminando…' : 'Terminar reunión'}
        </button>
      )}
    </div>
  );
}
