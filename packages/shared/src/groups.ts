import { z } from 'zod';
import { cuid2Id } from './ids';

export const GROUP_NAME_MAX_LENGTH = 80;

export const GroupName = z.string().trim().min(1).max(GROUP_NAME_MAX_LENGTH);

/** `POST /groups`: the server generates the access code. */
export const CreateGroupRequest = z.object({ name: GroupName });
export type CreateGroupRequest = z.infer<typeof CreateGroupRequest>;

/** `PATCH /groups/:id`: only the name and the registration switch; other keys are ignored. */
export const UpdateGroupRequest = z
  .object({
    name: GroupName.optional(),
    accessOpen: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.accessOpen !== undefined, {
    message: 'Provide name or accessOpen',
  });
export type UpdateGroupRequest = z.infer<typeof UpdateGroupRequest>;

/** One row of `GET /groups` (groups the teacher teaches). */
export const GroupSummaryResponse = z.object({
  id: cuid2Id,
  name: z.string(),
  accessCode: z.string(),
  accessOpen: z.boolean(),
  teamCount: z.number().int().nonnegative(),
  studentCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});
export type GroupSummaryResponse = z.infer<typeof GroupSummaryResponse>;

/** `POST /groups`, `PATCH /groups/:id` and access-code regeneration. */
export const GroupResponse = GroupSummaryResponse.omit({ teamCount: true, studentCount: true });
export type GroupResponse = z.infer<typeof GroupResponse>;

/** A student registered in the group; `teamId` is null while unassigned. */
export const GroupStudent = z.object({
  id: cuid2Id,
  name: z.string(),
  username: z.string(),
  teamId: cuid2Id.nullable(),
});
export type GroupStudent = z.infer<typeof GroupStudent>;

export const TeamSummary = z.object({
  id: cuid2Id,
  name: z.string(),
  moderatorId: cuid2Id.nullable(),
  memberCount: z.number().int().nonnegative(),
});
export type TeamSummary = z.infer<typeof TeamSummary>;

/** `GET /groups/:id`: members are listed once, in `students`, each pointing at its team. */
export const GroupDetailResponse = GroupResponse.extend({
  students: z.array(GroupStudent),
  teams: z.array(TeamSummary),
});
export type GroupDetailResponse = z.infer<typeof GroupDetailResponse>;
