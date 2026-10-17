import type {
  CreateTeamRequest,
  SessionUser,
  SetModeratorRequest,
  SetTeamMembersRequest,
  TeamResponse,
  UpdateTeamRequest,
} from '@kanbit/shared';
import { assertGroupTeacher, assertTeamTeacher, teamNotFound } from '../../http/authz';
import { AppError } from '../../http/errors';
import { isUniqueViolation } from '../../lib/prisma';
import { type MemberPlan, planMembers } from './team-members.rules';

export interface TeamMemberRecord {
  userId: string;
  name: string;
  username: string;
  isModerator: boolean;
  rowOrder: number;
}

export interface TeamRecord {
  id: string;
  groupId: string;
  /** Teacher of the team's group. */
  teacherId: string;
  name: string;
  updatedAt: Date;
  /** Ordered by `rowOrder`. */
  members: TeamMemberRecord[];
}

/** Persistence port for teams; the Prisma adapter lives in `teams.repository.ts`. */
export interface TeamsRepository {
  transaction<T>(fn: (repository: TeamsRepository) => Promise<T>): Promise<T>;
  findGroup(groupId: string): Promise<{ id: string; teacherId: string } | null>;
  /** Ordered by creation. */
  listByGroup(groupId: string): Promise<TeamRecord[]>;
  findById(teamId: string): Promise<TeamRecord | null>;
  create(data: { groupId: string; name: string }): Promise<TeamRecord>;
  rename(teamId: string, name: string): Promise<void>;
  countCards(teamId: string): Promise<number>;
  /** Deletes the team with its memberships and projects. */
  delete(teamId: string): Promise<void>;
  /** The ids among `userIds` that belong to STUDENT members of the group. */
  findGroupStudentIds(groupId: string, userIds: readonly string[]): Promise<string[]>;
  /** Deletes `plan.remove`, updates `plan.keep`, then inserts `plan.create`. */
  applyMemberPlan(team: { id: string; groupId: string }, plan: MemberPlan): Promise<void>;
  /**
   * Unfinished cards (status other than DONE) of these users go back to the team backlog, unassigned, with their
   * history (`releaseEvents`) authored by `actorId`.
   */
  releaseUnfinishedCards(teamId: string, userIds: readonly string[], actorId: string): Promise<void>;
  /** Makes `userId` the only moderator of the team. */
  setModerator(teamId: string, userId: string): Promise<void>;
}

export interface TeamsService {
  list(actor: SessionUser, groupId: string): Promise<TeamResponse[]>;
  create(actor: SessionUser, groupId: string, input: CreateTeamRequest): Promise<TeamResponse>;
  rename(actor: SessionUser, teamId: string, input: UpdateTeamRequest): Promise<TeamResponse>;
  remove(actor: SessionUser, teamId: string): Promise<void>;
  setMembers(actor: SessionUser, teamId: string, input: SetTeamMembersRequest): Promise<TeamResponse>;
  setModerator(actor: SessionUser, teamId: string, input: SetModeratorRequest): Promise<TeamResponse>;
}

export interface TeamsServiceDeps {
  repository: TeamsRepository;
}

export const toTeamResponse = ({ id, groupId, name, updatedAt, members }: TeamRecord): TeamResponse => ({
  id,
  groupId,
  name,
  moderatorId: moderatorOf(members),
  updatedAt: updatedAt.toISOString(),
  members: members.map(({ userId, name: memberName, username, isModerator, rowOrder }) => ({
    userId,
    name: memberName,
    username,
    isModerator,
    rowOrder,
  })),
});

const moderatorOf = (members: readonly TeamMemberRecord[]): string | null =>
  members.find((member) => member.isModerator)?.userId ?? null;

const memberIds = (team: TeamRecord): string[] => team.members.map((member) => member.userId);

/** Teacher-only team administration (spec §8.5.2); every method checks group ownership. */
export function createTeamsService({ repository }: TeamsServiceDeps): TeamsService {
  async function findOwned(repo: TeamsRepository, actor: SessionUser, teamId: string): Promise<TeamRecord> {
    const team = await repo.findById(teamId);
    assertTeamTeacher(actor, team);
    return team;
  }

  async function reload(repo: TeamsRepository, teamId: string): Promise<TeamResponse> {
    const team = await repo.findById(teamId);
    if (!team) throw teamNotFound();
    return toTeamResponse(team);
  }

  /** Applies a plan and releases the cards of whoever left the team (spec §6.1). */
  async function applyPlan(repo: TeamsRepository, actor: SessionUser, team: TeamRecord, plan: MemberPlan) {
    await repo.applyMemberPlan(team, plan);
    if (plan.remove.length > 0) await repo.releaseUnfinishedCards(team.id, plan.remove, actor.id);
  }

  return {
    async list(actor, groupId) {
      assertGroupTeacher(actor, await repository.findGroup(groupId));
      return (await repository.listByGroup(groupId)).map(toTeamResponse);
    },

    async create(actor, groupId, { name }) {
      const group = await repository.findGroup(groupId);
      assertGroupTeacher(actor, group);
      return toTeamResponse(await repository.create({ groupId: group.id, name }));
    },

    async rename(actor, teamId, { name }) {
      await findOwned(repository, actor, teamId);
      await repository.rename(teamId, name);
      return reload(repository, teamId);
    },

    async remove(actor, teamId) {
      await repository.transaction(async (tx) => {
        await findOwned(tx, actor, teamId);
        if ((await tx.countCards(teamId)) > 0) {
          throw new AppError(409, 'TEAM_HAS_CARDS', 'A team with cards cannot be deleted');
        }
        await tx.delete(teamId);
      });
    },

    async setMembers(actor, teamId, { userIds }) {
      try {
        return await repository.transaction(async (tx) => {
          const team = await findOwned(tx, actor, teamId);

          const students = new Set(await tx.findGroupStudentIds(team.groupId, userIds));
          const invalid = userIds.filter((id) => !students.has(id));
          if (invalid.length > 0) {
            throw new AppError(400, 'INVALID_MEMBERS', 'Every member must be a student of the group', {
              userIds: invalid,
            });
          }

          // One team per student per group: incoming students leave their current team first.
          const incoming = new Set(userIds);
          for (const other of await tx.listByGroup(team.groupId)) {
            const current = memberIds(other);
            if (other.id === team.id || !current.some((id) => incoming.has(id))) continue;
            const remaining = current.filter((id) => !incoming.has(id));
            await applyPlan(tx, actor, other, planMembers(current, remaining, moderatorOf(other.members)));
          }

          await applyPlan(tx, actor, team, planMembers(memberIds(team), userIds, moderatorOf(team.members)));
          return reload(tx, team.id);
        });
      } catch (err) {
        // Another request changed the same memberships between our read and write.
        if (isUniqueViolation(err)) {
          throw new AppError(409, 'MEMBERS_CONFLICT', 'Team members changed concurrently; reload and retry');
        }
        throw err;
      }
    },

    async setModerator(actor, teamId, { userId }) {
      return repository.transaction(async (tx) => {
        const team = await findOwned(tx, actor, teamId);
        if (!team.members.some((member) => member.userId === userId)) {
          throw new AppError(400, 'NOT_A_TEAM_MEMBER', 'The moderator must be a member of the team');
        }
        await tx.setModerator(teamId, userId);
        return reload(tx, teamId);
      });
    },
  };
}
