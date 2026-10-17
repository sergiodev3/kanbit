import { useParams } from 'react-router';
import { useMe } from '../auth/auth.api';
import { LazyProjectionPage } from './LazyProjectionPage';

/** Spec §8.4 for students: the projection of the viewer's own team. */
export function TeamProjectionPage() {
  const me = useMe();
  if (!me.data) return null;
  // A student registers with one group code, so v1.0 has a single membership per student.
  const membership = me.data.memberships[0];

  if (!membership?.teamId) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Proyección</h1>
        <p role="status" className="rounded-xl bg-white p-4 text-slate-700 shadow-sm ring-1 ring-slate-200">
          Tu docente todavía no te asigna a un equipo.
        </p>
      </div>
    );
  }

  return <LazyProjectionPage teamId={membership.teamId} />;
}

/** Spec §8.4 for the teacher: the projection of any team. */
export function TeacherProjectionPage() {
  const { teamId = '' } = useParams();
  return <LazyProjectionPage teamId={teamId} />;
}
