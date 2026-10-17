import { Link } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { useOnlineStatus } from '../../shared/pwa/OfflineBanner';
import { useMe } from '../auth/auth.api';
import { useBoard } from '../board/board.api';
import { viewerOf } from '../board/board-model';
import { useMeetingDetail, useTodayMeeting } from './meetings.api';
import {
  checkinRows,
  formatMeetingDate,
  meetingPath,
  meetingTypeLabel,
  NO_MEETING_MESSAGES,
  noMeetingReason,
} from './meetings-model';
import { ProjectionBoard } from './ProjectionBoard';
import { ProjectionCheckins } from './ProjectionCheckins';
import { ProjectionTimer } from './ProjectionTimer';
import { useWakeLock } from './useWakeLock';

export interface ProjectionPageProps {
  teamId: string;
}

const exitLink =
  'rounded-xl px-4 py-2 text-xl font-semibold text-white underline underline-offset-4 ring-2 ring-slate-500 hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-white';

/**
 * Spec §8.4 "Modo proyección": a full-screen, high-contrast view for the classroom projector. It covers the app
 * chrome, keeps the screen awake and shows the countdown, the team's check-ins and a compact board.
 */
export function ProjectionPage({ teamId }: ProjectionPageProps) {
  useWakeLock();
  const board = useBoard(teamId);
  const today = useTodayMeeting(teamId);
  const me = useMe();
  const online = useOnlineStatus();
  const detail = useMeetingDetail(today.data?.meeting?.id ?? null);

  const isTeacher = me.data?.user.role === 'TEACHER';
  const exit = (
    <Link to={meetingPath(teamId, isTeacher)} className={exitLink}>
      Salir de proyección
    </Link>
  );
  const frame = (content: React.ReactNode) => (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950 p-6 text-white">
      <div className="mx-auto max-w-[120rem] space-y-8">{content}</div>
    </div>
  );

  // The role decides where "Salir" leads, so wait for the session too.
  if (board.isPending || today.isPending || me.isPending) {
    return frame(
      <p role="status" className="text-3xl">
        Cargando proyección…
      </p>,
    );
  }
  if (!board.data || !today.data) {
    return frame(
      <>
        <p role="alert" className="rounded-xl bg-red-950 p-4 text-2xl font-semibold text-red-100 ring-2 ring-red-400">
          {errorMessage(board.error ?? today.error)}
        </p>
        {exit}
      </>,
    );
  }

  const userId = me.data?.user.id ?? null;
  const viewer = userId ? viewerOf(board.data, userId) : null;
  const canManage = isTeacher || viewer?.isModerator === true;
  // The detail is the fresher copy (polled); the today copy shows the meeting until it arrives.
  const meeting = detail.data ?? today.data.meeting;
  const type = meeting?.type ?? today.data.suggestedType;
  const reason = noMeetingReason(board.data);

  return frame(
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-5xl font-black">{board.data.team.name}</h1>
          <p className="text-3xl text-slate-300">
            {type ? `${meetingTypeLabel(type)} · ${formatMeetingDate(today.data.date)}` : formatMeetingDate(today.data.date)}
          </p>
        </div>
        {exit}
      </header>

      {!meeting ? (
        <div className="space-y-4 rounded-2xl bg-slate-900 p-6 ring-2 ring-slate-600">
          <p className="text-3xl">
            {today.data.suggestedType || !reason
              ? 'Todavía no hay reunión de hoy. El moderador o el docente la crea desde la página de la reunión.'
              : NO_MEETING_MESSAGES[reason]}
          </p>
          <Link to={meetingPath(teamId, isTeacher)} className={exitLink}>
            Ir a la reunión de hoy
          </Link>
        </div>
      ) : (
        <>
          <ProjectionTimer teamId={teamId} meeting={meeting} canManage={canManage} online={online} />
          {detail.data ? (
            <ProjectionCheckins rows={checkinRows(board.data.members, detail.data.checkins)} />
          ) : (
            <p role={detail.isError ? 'alert' : 'status'} className="text-2xl text-slate-300">
              {detail.isError ? errorMessage(detail.error) : 'Cargando check-ins…'}
            </p>
          )}
          <ProjectionBoard board={board.data} />
        </>
      )}
    </>,
  );
}
