import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { CardsRepository } from './cards.service';

const teamSelect = {
  id: true,
  name: true,
  groupId: true,
  group: { select: { teacherId: true } },
  members: {
    orderBy: { rowOrder: 'asc' },
    select: { userId: true, isModerator: true, rowOrder: true, user: { select: { name: true, username: true } } },
  },
} satisfies Prisma.TeamSelect;

const sprintSelect = {
  id: true,
  number: true,
  startDate: true,
  endDate: true,
  goal: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.SprintSelect;

const projectSelect = { id: true, teamId: true, name: true, updatedAt: true } satisfies Prisma.ProjectSelect;

/** Postgres `date` columns come back as UTC midnight. */
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Prisma adapter for the cards service. Inside a transaction `root` is null and calls run on `db`.
 * Card ordering is done in the service (bytewise), never with SQL collation.
 */
function bind(db: Prisma.TransactionClient, root: PrismaClient | null): CardsRepository {
  const repository: CardsRepository = {
    transaction: (fn) => (root ? root.$transaction((tx) => fn(bind(tx, null))) : fn(repository)),

    async findTeam(teamId) {
      const team = await db.team.findUnique({ where: { id: teamId }, select: teamSelect });
      if (!team) return null;
      const { group, members, ...rest } = team;
      return {
        ...rest,
        teacherId: group.teacherId,
        members: members.map(({ user, ...member }) => ({ ...member, name: user.name, username: user.username })),
      };
    },

    async findOpenSprint(teamId) {
      const sprint = await db.sprint.findFirst({ where: { teamId, status: 'OPEN' }, select: sprintSelect });
      return sprint ? { ...sprint, startDate: toIsoDate(sprint.startDate), endDate: toIsoDate(sprint.endDate) } : null;
    },

    listProjects: (teamId) =>
      db.project.findMany({ where: { teamId }, orderBy: { createdAt: 'asc' }, select: projectSelect }),

    listBoardCards: (teamId, sprintId) =>
      db.card.findMany({ where: { teamId, OR: [{ sprintId: null }, ...(sprintId ? [{ sprintId }] : [])] } }),

    findProject: (projectId) =>
      db.project.findUnique({ where: { id: projectId }, select: { id: true, teamId: true } }),

    findCard: (cardId) => db.card.findUnique({ where: { id: cardId } }),

    async listCellPositions(teamId, { assigneeId, status }) {
      const cards = await db.card.findMany({ where: { teamId, assigneeId, status }, select: { position: true } });
      return cards.map((card) => card.position);
    },

    createCard: (data) => db.card.create({ data }),

    async updateCard(cardId, version, changes) {
      const { count } = await db.card.updateMany({ where: { id: cardId, updatedAt: version }, data: changes });
      return count === 0 ? null : db.card.findUnique({ where: { id: cardId } });
    },

    async deleteCard(cardId, version) {
      // CardEvent rows cascade (schema onDelete: Cascade).
      const { count } = await db.card.deleteMany({ where: { id: cardId, updatedAt: version } });
      return count > 0;
    },

    async addEvent(event) {
      await db.cardEvent.create({ data: event });
    },
  };
  return repository;
}

export function createPrismaCardsRepository(prisma: PrismaClient): CardsRepository {
  return bind(prisma, prisma);
}
