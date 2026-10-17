import type { CreateProjectRequest, ProjectResponse } from '@kanbit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../../lib/api';

export const projectKeys = {
  team: (teamId: string) => ['teams', teamId, 'projects'] as const,
};

/** Prefix of every query of a team: project changes also refresh the board, which lists project names. */
const teamQueries = (teamId: string) => ['teams', teamId] as const;

export function useTeamProjects(teamId: string) {
  return useQuery({
    queryKey: projectKeys.team(teamId),
    queryFn: () => apiGet<ProjectResponse[]>(`/teams/${teamId}/projects`),
  });
}

export function useCreateProject(teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectRequest) => apiPost<ProjectResponse>(`/teams/${teamId}/projects`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: teamQueries(teamId) }),
  });
}

export function useRenameProject(teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, name }: { projectId: string; name: string }) =>
      apiPatch<ProjectResponse>(`/projects/${projectId}`, { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: teamQueries(teamId) }),
  });
}
