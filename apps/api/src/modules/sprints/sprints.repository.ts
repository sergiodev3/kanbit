import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { SprintsRepository, TeamSprintRecord } from './sprints.service';

const sprintSelect = {
  id: true,
  teamId: true,
  number: true,
  startDate: true,
  endDate: true,
  goal: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.SprintSelect;

type SprintRow = Prisma.SprintGetPayload<{ select: typeof sprintSelect }>;

/** Postgres `date` columns come back as UTC midnight. */
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const fromIsoDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

const toRecord = (sprint: SprintRow): TeamSprintRecord => ({
  ...sprint,
  startDate: toIsoDate(sprint.startDate),
  endDate: toIsoDate(sprint.endDate),
});

/** Prisma adapter for the sprints service. Inside a transaction `root` is null and calls run on `db`. */
function bind(db: Prisma.TransactionClient, root: PrismaClient | null): SprintsRepository {
  const repository: SprintsRepository = {
    transaction: (fn) => (root ? root.$transaction((tx) => fn(bind(tx, null))) : fn(repository)),

    async findTeam(teamId) {
      const team = await db.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          group: { select: { teacherId: true, timezone: true } },
          members: { select: { userId: true, isModerator: true } },
        },
      });
      if (!team) return null;
      return { id: team.id, teacherId: team.group.teacherId, timezone: team.group.timezone, members: team.members };
    },

    async findSprint(sprintId) {
      const sprint = await db.sprint.findUnique({ where: { id: sprintId }, select: sprintSelect });
      return sprint ? toRecord(sprint) : null;
    },

    async hasOpenSprint(teamId) {
      return (await db.sprint.count({ where: { teamId, status: 'OPEN' } })) > 0;
    },

    async lastSprintNumber(teamId) {
      const { _max } = await db.sprint.aggregate({ where: { teamId }, _max: { number: true } });
      return _max.number;
    },

    async createSprint({ startDate, endDate, ...data }) {
      const sprint = await db.sprint.create({
        data: { ...data, startDate: fromIsoDate(startDate), endDate: fromIsoDate(endDate), status: 'OPEN' },
        select: sprintSelect,
      });
      return toRecord(sprint);
    },

    async adoptOrphanCards(teamId, sprintId, now) {
      await db.card.updateMany({
        where: { teamId, sprintId: null, status: { not: 'BACKLOG' } },
        data: { sprintId, updatedAt: now },
      });
    },

    async closeSprint(sprintId, now) {
      const { count } = await db.sprint.updateMany({
        where: { id: sprintId, status: 'OPEN' },
        data: { status: 'CLOSED', updatedAt: now },
      });
      if (count === 0) return null;
      const sprint = await db.sprint.findUnique({ where: { id: sprintId }, select: sprintSelect });
      return sprint ? toRecord(sprint) : null;
    },

    listUnfinishedCards: (sprintId) => db.card.findMany({ where: { sprintId, status: { not: 'DONE' } } }),

    async listCellPositions(teamId, { assigneeId, status }) {
      const cards = await db.card.findMany({ where: { teamId, assigneeId, status }, select: { position: true } });
      return cards.map((card) => card.position);
    },

    async returnCardToBacklog(cardId, sprintId, version, changes) {
      const where = { id: cardId, sprintId, updatedAt: version };
      const { count } = await db.card.updateMany({ where, data: changes });
      return count > 0;
    },

    async addEvent(event) {
      await db.cardEvent.create({ data: event });
    },
  };
  return repository;
}

export function createPrismaSprintsRepository(prisma: PrismaClient): SprintsRepository {
  return bind(prisma, prisma);
}
