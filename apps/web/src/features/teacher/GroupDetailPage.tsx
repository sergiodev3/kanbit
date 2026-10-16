import { GROUP_NAME_MAX_LENGTH, GroupName, TEAM_NAME_MAX_LENGTH, TeamName, type GroupDetailResponse, type GroupStudent } from '@kanbit/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { cardClasses, ErrorSummary, linkClasses } from '../../shared/forms/FormParts';
import { NameForm } from '../../shared/forms/NameForm';
import { primaryButton, secondaryButton } from '../../shared/ui/buttons';
import { CopyButton } from '../../shared/ui/CopyButton';
import { ConfirmDialog, Dialog } from '../../shared/ui/Dialog';
import { TeamEditor } from './TeamEditor';
import {
  useCreateTeam,
  useGroup,
  useGroupTeams,
  useRegenerateAccessCode,
  useResetPassword,
  useUpdateGroup,
} from './teacher.api';

const alertClasses = 'rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200';

/** Spec §8.5.1, §8.5.2 and §8.5.8 (Phase 1): one group's access, students and teams. */
export function GroupDetailPage() {
  const { groupId = '' } = useParams();
  const group = useGroup(groupId);

  return (
    <div className="space-y-6">
      <Link to="/teacher" className={linkClasses}>
        ← Mis grupos
      </Link>
      {group.isPending && (
        <p role="status" className="text-slate-600">
          Cargando grupo…
        </p>
      )}
      {group.isError && (
        <p role="alert" className={alertClasses}>
          {errorMessage(group.error)}
        </p>
      )}
      {group.data && (
        <>
          <GroupHeader group={group.data} />
          <AccessSection group={group.data} />
          <StudentsSection group={group.data} />
          <TeamsSection group={group.data} />
        </>
      )}
    </div>
  );
}

function GroupHeader({ group }: { group: GroupDetailResponse }) {
  const updateGroup = useUpdateGroup(group.id);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className={cardClasses}>
        <NameForm
          id="group-name"
          label="Nombre del grupo"
          schema={GroupName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          requiredMessage="Escribe el nombre del grupo."
          submitLabel="Guardar nombre"
          pendingLabel="Guardando…"
          initialValue={group.name}
          onSubmit={async (name) => {
            await updateGroup.mutateAsync({ name });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-2xl font-bold">{group.name}</h1>
      <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
        Cambiar nombre
      </button>
    </div>
  );
}

function AccessSection({ group }: { group: GroupDetailResponse }) {
  const titleId = useId();
  const switchLabelId = useId();
  const switchHintId = useId();
  const updateGroup = useUpdateGroup(group.id);
  const regenerate = useRegenerateAccessCode(group.id);
  const [confirming, setConfirming] = useState(false);
  const link = `${window.location.origin}/register?code=${group.accessCode}`;
  const open = group.accessOpen;

  const closeConfirm = () => {
    regenerate.reset();
    setConfirming(false);
  };

  return (
    <section aria-labelledby={titleId} className={cardClasses}>
      <h2 id={titleId} className="text-lg font-bold">
        Código de acceso
      </h2>
      <p className="text-center font-mono text-4xl font-bold tracking-widest text-slate-900">{group.accessCode}</p>
      <div className="space-y-2">
        <p className="text-sm text-slate-600">Enlace de registro para tus alumnos:</p>
        <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-sm text-slate-800 ring-1 ring-slate-200">{link}</p>
        <div className="flex flex-wrap items-start gap-2">
          <CopyButton text={link} label="Copiar enlace" />
          <button type="button" onClick={() => setConfirming(true)} className={secondaryButton}>
            Regenerar código
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
        <div>
          <span id={switchLabelId} className="font-semibold">
            Registro abierto
          </span>
          <p id={switchHintId} className="text-sm text-slate-600">
            {open
              ? 'Los alumnos pueden registrarse con el código.'
              : 'El registro está cerrado: nadie puede registrarse con el código.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={open}
          aria-labelledby={switchLabelId}
          aria-describedby={switchHintId}
          disabled={updateGroup.isPending}
          onClick={() => updateGroup.mutate({ accessOpen: !open })}
          className={`relative inline-flex h-7 w-12 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:opacity-60 ${
            open ? 'bg-brand-600' : 'bg-slate-500'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${open ? 'left-6' : 'left-1'}`}
          />
        </button>
      </div>
      {updateGroup.isError && (
        <p role="alert" className={alertClasses}>
          {errorMessage(updateGroup.error)}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="¿Regenerar el código de acceso?"
          confirmLabel="Regenerar"
          pendingLabel="Regenerando…"
          pending={regenerate.isPending}
          error={regenerate.error}
          onConfirm={() => regenerate.mutate(undefined, { onSuccess: () => setConfirming(false) })}
          onCancel={closeConfirm}
        >
          <p>El código actual y su enlace dejarán de funcionar. Los alumnos ya registrados no se ven afectados.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function StudentsSection({ group }: { group: GroupDetailResponse }) {
  const titleId = useId();
  const [resetting, setResetting] = useState<GroupStudent | null>(null);
  const teamNames = new Map(group.teams.map((team) => [team.id, team.name]));
  const unassigned = group.students.filter((student) => student.teamId === null);
  const assigned = group.students.filter((student) => student.teamId !== null);

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h2 id={titleId} className="text-lg font-bold">
        Alumnos ({group.students.length})
      </h2>
      {group.students.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-slate-600 shadow-sm ring-1 ring-slate-200">
          Aún no hay alumnos registrados. Comparte el enlace de registro con tu grupo.
        </p>
      )}
      {unassigned.length > 0 && (
        <StudentList title={`Sin equipo (${unassigned.length})`} students={unassigned} onReset={setResetting} />
      )}
      {assigned.length > 0 && (
        <StudentList
          title={`Con equipo (${assigned.length})`}
          students={assigned}
          teamNames={teamNames}
          onReset={setResetting}
        />
      )}
      {resetting && <ResetPasswordDialog student={resetting} onClose={() => setResetting(null)} />}
    </section>
  );
}

interface StudentListProps {
  title: string;
  students: GroupStudent[];
  teamNames?: ReadonlyMap<string, string>;
  onReset: (student: GroupStudent) => void;
}

function StudentList({ title, students, teamNames, onReset }: StudentListProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <h3 id={titleId} className="font-semibold">
        {title}
      </h3>
      <ul className="divide-y divide-slate-200">
        {students.map((student) => (
          <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="font-medium">{student.name}</p>
              <p className="text-sm text-slate-600">
                <span className="font-mono">{student.username}</span>
                {student.teamId && teamNames?.get(student.teamId) && (
                  <>
                    {' · '}
                    <span>{teamNames.get(student.teamId)}</span>
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onReset(student)}
              aria-label={`Restablecer contraseña de ${student.name}`}
              className={secondaryButton}
            >
              Restablecer contraseña
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Confirms, then shows the temporary password once; closing the dialog discards it. */
function ResetPasswordDialog({ student, onClose }: { student: GroupStudent; onClose: () => void }) {
  const reset = useResetPassword();
  const resultRef = useRef<HTMLDivElement>(null);
  const temporaryPassword = reset.data?.temporaryPassword;

  useEffect(() => {
    if (temporaryPassword) resultRef.current?.focus();
  }, [temporaryPassword]);

  if (temporaryPassword) {
    return (
      <Dialog title={`Contraseña temporal de ${student.name}`} onClose={onClose}>
        <div ref={resultRef} tabIndex={-1} className="space-y-3 focus:outline-none">
          <p className="text-sm text-slate-700">
            Compártela con el alumno ahora: no se volverá a mostrar. Podrá cambiarla en «Mi perfil».
          </p>
          <p className="select-all rounded-lg bg-slate-50 p-3 text-center font-mono text-2xl font-bold ring-1 ring-slate-200">
            {temporaryPassword}
          </p>
        </div>
        <CopyButton text={temporaryPassword} label="Copiar contraseña" />
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={primaryButton}>
            Listo
          </button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={`¿Restablecer la contraseña de ${student.name}?`} onClose={onClose}>
      <p className="text-sm text-slate-700">Se generará una contraseña temporal y la actual dejará de funcionar.</p>
      <ErrorSummary messages={reset.isError ? [errorMessage(reset.error)] : []} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cancelar
        </button>
        <button type="button" onClick={() => reset.mutate(student.id)} disabled={reset.isPending} className={primaryButton}>
          {reset.isPending ? 'Restableciendo…' : 'Restablecer'}
        </button>
      </div>
    </Dialog>
  );
}

function TeamsSection({ group }: { group: GroupDetailResponse }) {
  const titleId = useId();
  const teams = useGroupTeams(group.id);
  const createTeam = useCreateTeam(group.id);

  return (
    <section aria-labelledby={titleId} className="space-y-3">
      <h2 id={titleId} className="text-lg font-bold">
        Equipos
      </h2>
      <div className={cardClasses}>
        <NameForm
          id="new-team-name"
          label="Nombre del nuevo equipo"
          schema={TeamName}
          maxLength={TEAM_NAME_MAX_LENGTH}
          requiredMessage="Escribe el nombre del equipo."
          submitLabel="Crear equipo"
          pendingLabel="Creando…"
          resetOnSuccess
          onSubmit={(name) => createTeam.mutateAsync({ name })}
        />
      </div>
      {teams.isPending && (
        <p role="status" className="text-slate-600">
          Cargando equipos…
        </p>
      )}
      {teams.isError && (
        <p role="alert" className={alertClasses}>
          {errorMessage(teams.error)}
        </p>
      )}
      {teams.data?.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-slate-600 shadow-sm ring-1 ring-slate-200">
          Aún no hay equipos. Crea uno y asígnale integrantes.
        </p>
      )}
      {teams.data?.map((team) => (
        <TeamEditor key={team.id} groupId={group.id} team={team} students={group.students} teams={group.teams} />
      ))}
    </section>
  );
}
