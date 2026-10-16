import type { CreateProjectRequest, ProjectResponse, SessionUser, UpdateProjectRequest } from '@kanbit/shared';
import { type TeamAccess, assertModeratorOrTeacher, assertTeamMemberOrTeacher } from '../../http/authz';
import { AppError } from '../../http/errors';

export interface ProjectRecord {
  id: string;
  teamId: string;
  name: string;
  updatedAt: Date;
}

/** Persistence port for projects; the Prisma adapter lives in `projects.repository.ts`. */
export interface ProjectsRepository {
  findTeamAccess(teamId: string): Promise<TeamAccess | null>;
  /** Ordered by creation. */
  listByTeam(teamId: string): Promise<ProjectRecord[]>;
  findById(projectId: string): Promise<ProjectRecord | null>;
  create(data: { teamId: string; name: string }): Promise<ProjectRecord>;
  rename(projectId: string, name: string): Promise<ProjectRecord>;
}

export interface ProjectsService {
  list(actor: SessionUser, teamId: string): Promise<ProjectResponse[]>;
  create(actor: SessionUser, teamId: string, input: CreateProjectRequest): Promise<ProjectResponse>;
  rename(actor: SessionUser, projectId: string, input: UpdateProjectRequest): Promise<ProjectResponse>;
}

export interface ProjectsServiceDeps {
  repository: ProjectsRepository;
}

const projectNotFound = () => new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');

const toProjectResponse = ({ id, teamId, name, updatedAt }: ProjectRecord): ProjectResponse => ({
  id,
  teamId,
  name,
  updatedAt: updatedAt.toISOString(),
});

/** Team projects (spec §3): members and the teacher read; the moderator and the teacher write. */
export function createProjectsService({ repository }: ProjectsServiceDeps): ProjectsService {
  return {
    async list(actor, teamId) {
      assertTeamMemberOrTeacher(actor, await repository.findTeamAccess(teamId));
      return (await repository.listByTeam(teamId)).map(toProjectResponse);
    },

    async create(actor, teamId, { name }) {
      assertModeratorOrTeacher(actor, await repository.findTeamAccess(teamId));
      return toProjectResponse(await repository.create({ teamId, name }));
    },

    async rename(actor, projectId, { name }) {
      const project = await repository.findById(projectId);
      if (!project) throw projectNotFound();
      assertModeratorOrTeacher(actor, await repository.findTeamAccess(project.teamId), projectNotFound);
      return toProjectResponse(await repository.rename(projectId, name));
    },
  };
}
