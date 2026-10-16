import { GROUP_NAME_MAX_LENGTH, GroupName } from '@kanbit/shared';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { cardClasses } from '../../shared/forms/FormParts';
import { NameForm } from '../../shared/forms/NameForm';
import { useCreateGroup, useGroups } from './teacher.api';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Spec §8.5.1: the teacher's groups and a form to create one. */
export function GroupsPage() {
  const groups = useGroups();
  const createGroup = useCreateGroup();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <section aria-labelledby="groups-title" className="space-y-3">
        <h1 id="groups-title" className="text-2xl font-bold">
          Mis grupos
        </h1>
        {groups.isPending && (
          <p role="status" className="text-slate-600">
            Cargando grupos…
          </p>
        )}
        {groups.isError && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
            {errorMessage(groups.error)}
          </p>
        )}
        {groups.data?.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-slate-600 shadow-sm ring-1 ring-slate-200">
            Todavía no tienes grupos. Crea el primero con el formulario de abajo.
          </p>
        )}
        {groups.data && groups.data.length > 0 && (
          <ul className="space-y-2">
            {groups.data.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/teacher/groups/${group.id}`}
                  className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <span className="block font-semibold">{group.name}</span>
                  <span className="block text-sm text-slate-600">
                    {plural(group.teamCount, 'equipo', 'equipos')} · {plural(group.studentCount, 'alumno', 'alumnos')}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-sm">
                    <span className="font-mono text-slate-800">Código {group.accessCode}</span>
                    <span className={group.accessOpen ? 'text-emerald-800' : 'text-slate-600'}>
                      {group.accessOpen ? 'Registro abierto' : 'Registro cerrado'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="new-group-title" className={cardClasses}>
        <h2 id="new-group-title" className="text-lg font-bold">
          Nuevo grupo
        </h2>
        <NameForm
          id="new-group-name"
          label="Nombre del grupo"
          schema={GroupName}
          maxLength={GROUP_NAME_MAX_LENGTH}
          requiredMessage="Escribe el nombre del grupo."
          submitLabel="Crear grupo"
          pendingLabel="Creando…"
          resetOnSuccess
          onSubmit={async (name) => {
            const group = await createGroup.mutateAsync({ name });
            await navigate(`/teacher/groups/${group.id}`);
          }}
        />
      </section>
    </div>
  );
}
