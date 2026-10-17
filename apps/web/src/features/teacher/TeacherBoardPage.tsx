import { Link, useParams } from 'react-router';
import { linkClasses } from '../../shared/forms/FormParts';
import { useBoard } from '../board/board.api';
import { LazyBoardPage } from '../board/LazyBoardPage';

/** Spec §8.5.5 / §12.1: the teacher opens any team's board read-only. */
export function TeacherBoardPage() {
  const { teamId = '' } = useParams();
  // Same query as the board itself (deduplicated): only used for the way back to the group.
  const board = useBoard(teamId);
  const groupId = board.data?.team.groupId;

  return (
    <div className="space-y-4">
      <Link to={groupId ? `/teacher/groups/${groupId}` : '/teacher'} className={linkClasses}>
        {groupId ? '← Volver al grupo' : '← Mis grupos'}
      </Link>
      <LazyBoardPage teamId={teamId} readOnly />
    </div>
  );
}
