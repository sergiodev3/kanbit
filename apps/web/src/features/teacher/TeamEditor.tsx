import { TEAM_NAME_MAX_LENGTH, TeamName, type GroupStudent, type TeamResponse, type TeamSummary } from '@kanbit/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { cardClasses, ErrorSummary } from '../../shared/forms/FormParts';
import { NameForm } from '../../shared/forms/NameForm';
import { primaryButton, secondaryButton } from '../../shared/ui/buttons';
import { ConfirmDialog } from '../../shared/ui/Dialog';
import { ProjectsPanel } from '../projects/ProjectsPanel';
import { useDeleteTeam, useRenameTeam, useSaveTeamMembers } from './teacher.api';

interface TeamEditorProps {
  groupId: string;
  team: TeamResponse;
  /** Every student of the group; any of them can be selected. */
  students: GroupStudent[];
  /** The group's teams, to label students who already belong to another one. */
  teams: TeamSummary[];
}

/** Spec §8.5.2: rename, members, moderator and deletion of one team. */
export function TeamEditor({ groupId, team, students, teams }: TeamEditorProps) {
  const renameTeam = useRenameTeam(groupId);
  const deleteTeam = useDeleteTeam(groupId);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const closeDelete = () => {
    deleteTeam.reset();
    setConfirmingDelete(false);
  };

  return (
    <article aria-label={team.name} className={cardClasses}>
      {renaming ? (
        <NameForm
          id={`team-name-${team.id}`}
          label="Nombre del equipo"
          schema={TeamName}
          maxLength={TEAM_NAME_MAX_LENGTH}
          requiredMessage="Escribe el nombre del equipo."
          submitLabel="Guardar nombre"
          pendingLabel="Guardando…"
          initialValue={team.name}
          onSubmit={async (name) => {
            await renameTeam.mutateAsync({ teamId: team.id, name });
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">
            {team.name}
          </h3>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/teacher/teams/${team.id}/board`}
              aria-label={`Ver tablero de ${team.name}`}
              className={primaryButton}
            >
              Ver tablero
            </Link>
            <button type="button" onClick={() => setRenaming(true)} className={secondaryButton}>
              Cambiar nombre
            </button>
            <button type="button" onClick={() => setConfirmingDelete(true)} className={secondaryButton}>
              Eliminar equipo
            </button>
          </div>
        </div>
      )}
      <MembersForm groupId={groupId} team={team} students={students} teams={teams} />
      <ProjectsPanel teamId={team.id} canEdit headingLevel={4} />
      {confirmingDelete && (
        <ConfirmDialog
          title={`¿Eliminar el equipo ${team.name}?`}
          confirmLabel="Eliminar"
          pendingLabel="Eliminando…"
          danger
          pending={deleteTeam.isPending}
          error={deleteTeam.error}
          onConfirm={() => deleteTeam.mutate(team.id)}
          onCancel={closeDelete}
        >
          <p>Sus integrantes quedarán sin equipo. Esta acción no se puede deshacer.</p>
        </ConfirmDialog>
      )}
    </article>
  );
}

const orderedMemberIds = (team: TeamResponse): string[] =>
  [...team.members].sort((a, b) => a.rowOrder - b.rowOrder).map((member) => member.userId);

/** Changes whenever the server-side members or moderator change, to resync the local selection. */
const membersSignature = (team: TeamResponse): string => `${orderedMemberIds(team).join(',')}|${team.moderatorId ?? ''}`;

function MembersForm({ groupId, team, students, teams }: TeamEditorProps) {
  const saveMembers = useSaveTeamMembers(groupId);
  const [syncedSignature, setSyncedSignature] = useState(() => membersSignature(team));
  const [selected, setSelected] = useState(() => orderedMemberIds(team));
  const [moderatorId, setModeratorId] = useState(team.moderatorId);

  const signature = membersSignature(team);
  if (signature !== syncedSignature) {
    setSyncedSignature(signature);
    setSelected(orderedMemberIds(team));
    setModeratorId(team.moderatorId);
  }

  const teamNames = new Map(teams.map((summary) => [summary.id, summary.name]));
  const names = new Map(students.map((student) => [student.id, student.name]));
  for (const member of team.members) if (!names.has(member.userId)) names.set(member.userId, member.name);
  const chosenModerator = moderatorId !== null && selected.includes(moderatorId) ? moderatorId : null;

  const toggle = (userId: string) => {
    saveMembers.reset();
    // New members go last: array order is the board row order.
    setSelected((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveMembers.mutate({ teamId: team.id, userIds: selected, moderatorId: chosenModerator });
  };

  const labelFor = (student: GroupStudent): string => {
    const otherTeam = student.teamId && student.teamId !== team.id ? teamNames.get(student.teamId) : undefined;
    return otherTeam ? `${student.name} (en ${otherTeam})` : student.name;
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      <ErrorSummary messages={saveMembers.isError ? [errorMessage(saveMembers.error)] : []} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">Integrantes</legend>
        <p className="text-sm text-slate-600">
          Si seleccionas a un alumno que está en otro equipo, se moverá a este equipo al guardar.
        </p>
        {students.length === 0 ? (
          <p className="text-sm text-slate-600">Aún no hay alumnos registrados en el grupo.</p>
        ) : (
          <ul className="space-y-1">
            {students.map((student) => {
              const id = `team-${team.id}-member-${student.id}`;
              return (
                <li key={student.id} className="flex items-center gap-3">
                  <input
                    id={id}
                    type="checkbox"
                    checked={selected.includes(student.id)}
                    onChange={() => toggle(student.id)}
                    className="h-5 w-5 rounded border-slate-400 accent-brand-600"
                  />
                  <label htmlFor={id} className="py-1 text-sm">
                    {labelFor(student)}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">Moderador</legend>
        {selected.length === 0 ? (
          <p className="text-sm text-slate-600">Selecciona integrantes para elegir al moderador.</p>
        ) : (
          <>
            {chosenModerator === null && (
              <p className="text-sm text-slate-600">Si no eliges a nadie, el primer integrante será el moderador.</p>
            )}
            <ul className="space-y-1">
              {selected.map((userId) => {
                const id = `team-${team.id}-moderator-${userId}`;
                return (
                  <li key={userId} className="flex items-center gap-3">
                    <input
                      id={id}
                      type="radio"
                      name={`team-${team.id}-moderator`}
                      checked={chosenModerator === userId}
                      onChange={() => {
                        saveMembers.reset();
                        setModeratorId(userId);
                      }}
                      className="h-5 w-5 accent-brand-600"
                    />
                    <label htmlFor={id} className="py-1 text-sm">
                      {names.get(userId) ?? userId}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saveMembers.isPending} className={primaryButton}>
          {saveMembers.isPending ? 'Guardando…' : 'Guardar integrantes'}
        </button>
        <span role="status" className="text-sm font-semibold text-emerald-800">
          {saveMembers.isSuccess && 'Equipo guardado.'}
        </span>
      </div>
    </form>
  );
}
