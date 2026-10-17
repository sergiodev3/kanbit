import { cardClasses } from '../../shared/forms/FormParts';
import { useMe } from '../auth/auth.api';
import { BoardPage } from '../board/BoardPage';
import { ProjectsPanel } from '../projects/ProjectsPanel';

/**
 * Spec §8.2 "Mi equipo / Tablero": the team board, with the team's projects below it (the moderator manages them
 * there). A student without a team is told to wait for the teacher.
 */
export function TeamHomePage() {
  const me = useMe();
  if (!me.data) return null;
  // A student registers with one group code, so v1.0 has a single membership per student.
  const membership = me.data.memberships[0];

  if (!membership?.teamId) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Mi equipo</h1>
        {membership && <p className="text-slate-600">{membership.groupName}</p>}
        <p role="status" className="rounded-xl bg-white p-4 text-slate-700 shadow-sm ring-1 ring-slate-200">
          Tu docente todavía no te asigna a un equipo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BoardPage teamId={membership.teamId} />
      <div className={`${cardClasses} max-w-xl`}>
        <ProjectsPanel teamId={membership.teamId} canEdit={membership.isModerator} headingLevel={2} />
      </div>
    </div>
  );
}
