import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { releaseEvents } from '../cards/card.rules';
import type { TeamRecord, TeamsRepository } from './teams.service';

const teamSelect = {
  id: true,
  groupId: true,
  name: true,
  updatedAt: true,
  group: { select: { teacherId: true } },
  members: {
    orderBy: { rowOrder: 'asc' },
    select: { userId: true, isModerator: true, rowOrder: true, user: { select: { name: true, username: true } } },
  },
} satisfies Prisma.TeamSelect;

type TeamRow = Prisma.TeamGetPayload<{ select: typeof teamSelect }>;

const toRecord = ({ group, members, ...team }: TeamRow): TeamRecord => ({
  ...team,
  teacherId: group.teacherId,
  members: members.map(({ user, ...member }) => ({ ...member, name: user.name, username: user.username })),
});

/** Prisma adapter for the teams service. Inside a transaction `root` is null and calls run on `db`. */
function bind(db: Prisma.TransactionClient, root: PrismaClient | null): TeamsRepository {
  const repository: TeamsRepository = {
    transaction: (fn) => (root ? root.$transaction((tx) => fn(bind(tx, null))) : fn(repository)),

    findGroup: (groupId) => db.group.findUnique({ where: { id: groupId }, select: { id: true, teacherId: true } }),

    async listByGroup(groupId) {
      const teams = await db.team.findMany({ where: { groupId }, orderBy: { createdAt: 'asc' }, select: teamSelect });
      return teams.map(toRecord);
    },

    async findById(teamId) {
      const team = await db.team.findUnique({ where: { id: teamId }, select: teamSelect });
      return team ? toRecord(team) : null;
    },

    async create(data) {
      return toRecord(await db.team.create({ data, select: teamSelect }));
    },

    async rename(teamId, name) {
      await db.team.update({ where: { id: teamId }, data: { name } });
    },

    countCards: (teamId) => db.card.count({ where: { teamId } }),

    async delete(teamId) {
      // TeamMember, Project and Sprint rows cascade from Team (schema onDelete: Cascade).
      await db.team.delete({ where: { id: teamId } });
    },

    async findGroupStudentIds(groupId, userIds) {
      const members = await db.groupMember.findMany({
        where: { groupId, userId: { in: [...userIds] }, user: { role: 'STUDENT' } },
        select: { userId: true },
      });
      return members.map((member) => member.userId);
    },

    async applyMemberPlan(team, plan) {
      if (plan.remove.length > 0) {
        await db.teamMember.deleteMany({ where: { teamId: team.id, userId: { in: plan.remove } } });
      }
      for (const { userId, rowOrder, isModerator } of plan.keep) {
        await db.teamMember.update({
          where: { teamId_userId: { teamId: team.id, userId } },
          data: { rowOrder, isModerator },
        });
      }
      if (plan.create.length > 0) {
        await db.teamMember.createMany({
          data: plan.create.map((row) => ({ ...row, teamId: team.id, groupId: team.groupId })),
        });
      }
    },

    async releaseUnfinishedCards(teamId, userIds, actorId) {
      const cards = await db.card.findMany({
        where: { teamId, assigneeId: { in: [...userIds] }, status: { not: 'DONE' } },
        select: { id: true, status: true },
      });
      if (cards.length === 0) return;
      // Backlog = no sprint, no assignee; BACKLOG cards are never validated. Updating by id keeps the rows and
      // their events in step inside the caller's transaction.
      await db.card.updateMany({
        where: { id: { in: cards.map((card) => card.id) } },
        data: { status: 'BACKLOG', assigneeId: null, sprintId: null, validated: false, validatedById: null },
      });
      await db.cardEvent.createMany({
        data: cards.flatMap((card) =>
          releaseEvents(card.status).map((event) => ({ cardId: card.id, userId: actorId, ...event })),
        ),
      });
    },

    async setModerator(teamId, userId) {
      await db.teamMember.updateMany({
        where: { teamId, isModerator: true, NOT: { userId } },
        data: { isModerator: false },
      });
      await db.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { isModerator: true } });
    },
  };
  return repository;
}

export function createPrismaTeamsRepository(prisma: PrismaClient): TeamsRepository {
  return bind(prisma, prisma);
}
