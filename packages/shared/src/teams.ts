import { z } from 'zod';
import { cuid2Id } from './ids';

export const TEAM_NAME_MAX_LENGTH = 60;
/** Bounds the request size only; v1.0 does not validate team sizes (spec §12.1). */
export const TEAM_MEMBERS_MAX = 50;

export const TeamName = z.string().trim().min(1).max(TEAM_NAME_MAX_LENGTH);

export const CreateTeamRequest = z.object({ name: TeamName });
export type CreateTeamRequest = z.infer<typeof CreateTeamRequest>;

export const UpdateTeamRequest = z.object({ name: TeamName });
export type UpdateTeamRequest = z.infer<typeof UpdateTeamRequest>;

/**
 * `PUT /teams/:id/members` replaces the whole member set; array order is the board row order.
 * A student already in another team of the same group is moved here.
 */
export const SetTeamMembersRequest = z.object({
  userIds: z
    .array(cuid2Id)
    .max(TEAM_MEMBERS_MAX)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Duplicate user ids' }),
});
export type SetTeamMembersRequest = z.infer<typeof SetTeamMembersRequest>;

export const SetModeratorRequest = z.object({ userId: cuid2Id });
export type SetModeratorRequest = z.infer<typeof SetModeratorRequest>;

export const TeamMemberResponse = z.object({
  userId: cuid2Id,
  name: z.string(),
  username: z.string(),
  isModerator: z.boolean(),
  rowOrder: z.number().int().nonnegative(),
});
export type TeamMemberResponse = z.infer<typeof TeamMemberResponse>;

/** A team with its members ordered by `rowOrder`; `moderatorId` is null only when it has no members. */
export const TeamResponse = z.object({
  id: cuid2Id,
  groupId: cuid2Id,
  name: z.string(),
  moderatorId: cuid2Id.nullable(),
  updatedAt: z.iso.datetime(),
  members: z.array(TeamMemberResponse),
});
export type TeamResponse = z.infer<typeof TeamResponse>;
