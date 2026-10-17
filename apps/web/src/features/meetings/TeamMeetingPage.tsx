import { Link } from 'react-router';
import { linkClasses } from '../../shared/forms/FormParts';
import { useMe } from '../auth/auth.api';
import { LazyMeetingPage } from './LazyMeetingPage';

/** Spec §8.4 for students: the meeting of the viewer's own team, resolved like the team board. */
export function TeamMeetingPage() {
  const me = useMe();
  if (!me.data) return null;
  // A student registers with one group code, so v1.0 has a single membership per student.
  const membership = me.data.memberships[0];

  if (!membership?.teamId) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Reunión de hoy</h1>
        <p role="status" className="rounded-xl bg-white p-4 text-slate-700 shadow-sm ring-1 ring-slate-200">
          Tu docente todavía no te asigna a un equipo.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/team" className={linkClasses}>
        ← Volver al tablero
      </Link>
      <LazyMeetingPage teamId={membership.teamId} />
    </div>
  );
}
