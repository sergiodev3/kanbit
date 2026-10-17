import { cardClasses } from '../../shared/forms/FormParts';
import { useMe } from '../auth/auth.api';
import { ProjectsPanel } from '../projects/ProjectsPanel';

/**
 * Spec §8.2 "Mi equipo" before the board exists (Phase 1): group, team, moderator role and the
 * team's projects. The board arrives in the next stage.
 */
export function TeamHomePage() {
  const me = useMe();
  if (!me.data) return null;
  // A student registers with one group code, so v1.0 has a single membership per student.
  const membership = me.data.memberships[0];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mi equipo</h1>
      {membership && <p className="text-slate-600">{membership.groupName}</p>}
      {membership?.teamId ? (
        <section aria-labelledby="my-team-title" className={cardClasses}>
          <div className="space-y-1">
            <h2 id="my-team-title" className="text-xl font-bold">
              {membership.teamName}
            </h2>
            {membership.isModerator && (
              <p className="inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-600">
                Eres moderador del equipo
              </p>
            )}
            <p className="text-sm text-slate-600">El tablero del equipo llegará en la siguiente etapa.</p>
          </div>
          <ProjectsPanel teamId={membership.teamId} canEdit={membership.isModerator} />
        </section>
      ) : (
        <p role="status" className="rounded-xl bg-white p-4 text-slate-700 shadow-sm ring-1 ring-slate-200">
          Tu docente todavía no te asigna a un equipo.
        </p>
      )}
    </div>
  );
}
