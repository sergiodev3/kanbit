import { Link, useParams } from 'react-router';
import { linkClasses } from '../../shared/forms/FormParts';
import { LazyMeetingPage } from './LazyMeetingPage';

/** Spec §8.4 for the teacher: any team's meeting; may create, start and end it and edit notes, but reads check-ins. */
export function TeacherMeetingPage() {
  const { teamId = '' } = useParams();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to={`/teacher/teams/${teamId}/board`} className={linkClasses}>
        ← Volver al tablero
      </Link>
      <LazyMeetingPage teamId={teamId} />
    </div>
  );
}
