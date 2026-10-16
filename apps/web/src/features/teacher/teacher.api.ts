import type {
  CreateGroupRequest,
  CreateTeamRequest,
  GroupDetailResponse,
  GroupResponse,
  GroupSummaryResponse,
  ResetPasswordResponse,
  TeamResponse,
  UpdateGroupRequest,
} from '@kanbit/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../lib/api';

/** Every group query sits under `['groups']`, so one prefix invalidation reaches a group and its teams. */
export const teacherKeys = {
  groups: ['groups'] as const,
  group: (groupId: string) => ['groups', groupId] as const,
  teams: (groupId: string) => ['groups', groupId, 'teams'] as const,
};

/** Team changes move students and change counts: refresh the group detail, its teams and the list. */
async function invalidateGroup(client: QueryClient, groupId: string): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: teacherKeys.group(groupId) }),
    client.invalidateQueries({ queryKey: teacherKeys.groups, exact: true }),
  ]);
}

export function useGroups() {
  return useQuery({
    queryKey: teacherKeys.groups,
    queryFn: () => apiGet<GroupSummaryResponse[]>('/groups'),
  });
}

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: teacherKeys.group(groupId),
    queryFn: () => apiGet<GroupDetailResponse>(`/groups/${groupId}`),
  });
}

export function useGroupTeams(groupId: string) {
  return useQuery({
    queryKey: teacherKeys.teams(groupId),
    queryFn: () => apiGet<TeamResponse[]>(`/groups/${groupId}/teams`),
  });
}

export function useCreateGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGroupRequest) => apiPost<GroupResponse>('/groups', body),
    onSuccess: () => client.invalidateQueries({ queryKey: teacherKeys.groups, exact: true }),
  });
}

/** Name or registration switch; the detail keeps its students and teams, so only those fields are merged. */
export function useUpdateGroup(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGroupRequest) => apiPatch<GroupResponse>(`/groups/${groupId}`, body),
    onSuccess: (group) => mergeGroup(client, group),
  });
}

export function useRegenerateAccessCode(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<GroupResponse>(`/groups/${groupId}/access-code/regenerate`),
    onSuccess: (group) => mergeGroup(client, group),
  });
}

async function mergeGroup(client: QueryClient, group: GroupResponse): Promise<void> {
  client.setQueryData<GroupDetailResponse>(teacherKeys.group(group.id), (detail) =>
    detail ? { ...detail, ...group } : detail,
  );
  await client.invalidateQueries({ queryKey: teacherKeys.groups, exact: true });
}

export function useCreateTeam(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTeamRequest) => apiPost<TeamResponse>(`/groups/${groupId}/teams`, body),
    onSuccess: () => invalidateGroup(client, groupId),
  });
}

export function useRenameTeam(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, name }: { teamId: string; name: string }) =>
      apiPatch<TeamResponse>(`/teams/${teamId}`, { name }),
    onSuccess: () => invalidateGroup(client, groupId),
  });
}

export function useDeleteTeam(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) => apiDelete(`/teams/${teamId}`),
    onSuccess: () => invalidateGroup(client, groupId),
  });
}

interface SaveTeamMembers {
  teamId: string;
  /** Array order is the board row order. */
  userIds: string[];
  /** Desired moderator; `null` lets the server keep or pick one. */
  moderatorId: string | null;
}

/**
 * Replaces the member set, then designates the moderator when it differs from the one the
 * server kept (it falls back to the first member when the previous moderator left).
 */
export function useSaveTeamMembers(groupId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userIds, moderatorId }: SaveTeamMembers) => {
      const team = await apiPut<TeamResponse>(`/teams/${teamId}/members`, { userIds });
      if (moderatorId === null || moderatorId === team.moderatorId || !userIds.includes(moderatorId)) return team;
      return apiPatch<TeamResponse>(`/teams/${teamId}/moderator`, { userId: moderatorId });
    },
    onSettled: () => invalidateGroup(client, groupId),
  });
}

/** `gcTime: 0` drops the temporary password from the mutation cache as soon as its dialog closes. */
export function useResetPassword() {
  return useMutation({
    gcTime: 0,
    mutationFn: (userId: string) => apiPost<ResetPasswordResponse>(`/users/${userId}/reset-password`),
  });
}
