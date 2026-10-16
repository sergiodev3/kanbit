import { z } from 'zod';
import { cuid2Id } from './ids';

export const PROJECT_NAME_MAX_LENGTH = 80;

export const ProjectName = z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH);

export const CreateProjectRequest = z.object({ name: ProjectName });
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

export const UpdateProjectRequest = z.object({ name: ProjectName });
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequest>;

export const ProjectResponse = z.object({
  id: cuid2Id,
  teamId: cuid2Id,
  name: z.string(),
  updatedAt: z.iso.datetime(),
});
export type ProjectResponse = z.infer<typeof ProjectResponse>;
