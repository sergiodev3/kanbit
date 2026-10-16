import { PROJECT_NAME_MAX_LENGTH, ProjectName, type ProjectResponse } from '@kanbit/shared';
import { useId, useState } from 'react';
import { errorMessage } from '../../lib/error-messages';
import { NameForm } from '../../shared/forms/NameForm';
import { secondaryButton } from '../../shared/ui/buttons';
import { useCreateProject, useRenameProject, useTeamProjects } from './projects.api';

interface ProjectsPanelProps {
  teamId: string;
  /** The teacher and the team's moderator can create and rename; other members only read. */
  canEdit: boolean;
  headingLevel?: 2 | 3 | 4;
}

/** Spec §12.1 "Proyectos": the team's projects, created and renamed by the moderator or the teacher. */
export function ProjectsPanel({ teamId, canEdit, headingLevel = 3 }: ProjectsPanelProps) {
  const titleId = useId();
  const projects = useTeamProjects(teamId);
  const createProject = useCreateProject(teamId);
  const Heading = `h${headingLevel}` as const;

  return (
    <section aria-labelledby={titleId} className="space-y-3 border-t border-slate-200 pt-4">
      <Heading id={titleId} className="font-bold">
        Proyectos
      </Heading>
      {projects.isPending && (
        <p role="status" className="text-sm text-slate-600">
          Cargando proyectos…
        </p>
      )}
      {projects.isError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
          {errorMessage(projects.error)}
        </p>
      )}
      {projects.data?.length === 0 && <p className="text-sm text-slate-600">Aún no hay proyectos.</p>}
      {projects.data && projects.data.length > 0 && (
        <ul className="divide-y divide-slate-200">
          {projects.data.map((project) => (
            <ProjectRow key={project.id} project={project} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit && (
        <NameForm
          id={`new-project-${teamId}`}
          label="Nombre del nuevo proyecto"
          schema={ProjectName}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          requiredMessage="Escribe el nombre del proyecto."
          submitLabel="Agregar proyecto"
          pendingLabel="Agregando…"
          resetOnSuccess
          onSubmit={(name) => createProject.mutateAsync({ name })}
        />
      )}
    </section>
  );
}

function ProjectRow({ project, canEdit }: { project: ProjectResponse; canEdit: boolean }) {
  const renameProject = useRenameProject(project.teamId);
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <li className="py-3">
        <NameForm
          id={`project-name-${project.id}`}
          label="Nombre del proyecto"
          schema={ProjectName}
          maxLength={PROJECT_NAME_MAX_LENGTH}
          requiredMessage="Escribe el nombre del proyecto."
          submitLabel="Guardar nombre"
          pendingLabel="Guardando…"
          initialValue={project.name}
          onSubmit={async (name) => {
            await renameProject.mutateAsync({ projectId: project.id, name });
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-sm font-medium">{project.name}</span>
      {canEdit && (
        <button
          type="button"
          onClick={() => setRenaming(true)}
          aria-label={`Cambiar nombre de ${project.name}`}
          className={secondaryButton}
        >
          Cambiar nombre
        </button>
      )}
    </li>
  );
}
