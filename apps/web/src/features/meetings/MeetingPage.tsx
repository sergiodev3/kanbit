import { errorMessage } from '../../lib/error-messages';
import { useOnlineStatus } from '../../shared/pwa/OfflineBanner';
import { useMe } from '../auth/auth.api';
import { useBoard } from '../board/board.api';
import { viewerOf } from '../board/board-model';
import { CaptureCheckin } from './CaptureCheckin';
import { CheckinForm } from './CheckinForm';
import { CheckinList } from './CheckinList';
import { MeetingControls } from './MeetingControls';
import { MeetingNotes } from './MeetingNotes';
import { useMeetingDetail, useTodayMeeting } from './meetings.api';
import { checkinRows, formatMeetingDate, meetingTypeLabel, noMeetingReason } from './meetings-model';

export interface MeetingPageProps {
  teamId: string;
}

const alertClasses = 'rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200';

/** Spec §8.4 "Reunión de hoy": the day's suggested meeting, its check-ins, notes and agreements. */
export function MeetingPage({ teamId }: MeetingPageProps) {
  const board = useBoard(teamId);
  const today = useTodayMeeting(teamId);
  const me = useMe();
  const online = useOnlineStatus();
  const detail = useMeetingDetail(today.data?.meeting?.id ?? null);

  if (board.isPending || today.isPending) {
    return (
      <p role="status" className="text-slate-600">
        Cargando reunión…
      </p>
    );
  }
  if (!board.data || !today.data) {
    return (
      <p role="alert" className={alertClasses}>
        {errorMessage(board.error ?? today.error)}
      </p>
    );
  }

  const isTeacher = me.data?.user.role === 'TEACHER';
  const userId = me.data?.user.id ?? null;
  const viewer = userId ? viewerOf(board.data, userId) : null;
  const canManage = isTeacher || viewer?.isModerator === true;
  // The detail is the fresher copy (polled); the today copy shows the meeting until it arrives.
  const meeting = detail.data ?? today.data.meeting;
  const type = meeting?.type ?? today.data.suggestedType;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Reunión de hoy</h1>
        <p className="text-slate-700">
          {type ? `${meetingTypeLabel(type)} · ${formatMeetingDate(today.data.date)}` : formatMeetingDate(today.data.date)}
        </p>
        <p className="text-sm text-slate-600">{board.data.team.name}</p>
      </header>

      {!online && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Sin conexión: no puedes guardar cambios de la reunión.
        </p>
      )}

      <MeetingControls
        teamId={teamId}
        meeting={meeting}
        suggestedType={today.data.suggestedType}
        reason={noMeetingReason(board.data)}
        canManage={canManage}
        online={online}
      />

      {meeting && !detail.data && (
        detail.isError ? (
          <p role="alert" className={alertClasses}>
            {errorMessage(detail.error)}
          </p>
        ) : (
          <p role="status" className="text-slate-600">
            Cargando check-ins…
          </p>
        )
      )}

      {meeting && detail.data && (
        <>
          {!isTeacher && viewer?.isMember && (
            <CheckinForm
              key={meeting.id}
              meetingId={meeting.id}
              mine={detail.data.checkins.find((checkin) => checkin.userId === userId) ?? null}
              online={online}
            />
          )}
          <CheckinList rows={checkinRows(board.data.members, detail.data.checkins)} />
          {!isTeacher && viewer?.isModerator && (
            <CaptureCheckin
              meetingId={meeting.id}
              rows={checkinRows(board.data.members, detail.data.checkins).filter(({ member }) => member.userId !== userId)}
              online={online}
            />
          )}
          <MeetingNotes teamId={teamId} meeting={detail.data} canEdit={canManage} online={online} />
        </>
      )}
    </div>
  );
}
