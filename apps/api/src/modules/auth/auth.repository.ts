import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../lib/prisma';
import type { AuthRepository, UserRecord } from './auth.service';

const userRecordSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  passwordHash: true,
} satisfies Prisma.UserSelect;

/** Prisma adapter for the auth service. Inside a transaction `root` is null and calls run on `db`. */
function bind(db: Prisma.TransactionClient, root: PrismaClient | null): AuthRepository {
  const repository: AuthRepository = {
    transaction: (fn) => (root ? root.$transaction((tx) => fn(bind(tx, null))) : fn(repository)),

    findGroupByAccessCode: (accessCode) =>
      db.group.findUnique({ where: { accessCode }, select: { id: true, accessOpen: true } }),

    findUserByUsername: (username): Promise<UserRecord | null> =>
      db.user.findUnique({ where: { username }, select: userRecordSelect }),

    findUserById: (id): Promise<UserRecord | null> => db.user.findUnique({ where: { id }, select: userRecordSelect }),

    async createStudent({ groupId, ...data }) {
      try {
        return await db.user.create({
          data: { ...data, role: 'STUDENT', groupMemberships: { create: { groupId } } },
          select: userRecordSelect,
        });
      } catch (err) {
        if (isUniqueViolation(err)) return null;
        throw err;
      }
    },

    async updatePasswordHash(userId, passwordHash) {
      await db.user.update({ where: { id: userId }, data: { passwordHash } });
    },

    async listMemberships(userId) {
      const members = await db.groupMember.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          groupId: true,
          group: { select: { name: true } },
          // At most one row: a student belongs to one team per group (unique groupId + userId).
          teamMemberships: { select: { teamId: true, isModerator: true, team: { select: { name: true } } } },
        },
      });
      return members.map(({ groupId, group, teamMemberships: [team] }) => ({
        groupId,
        groupName: group.name,
        teamId: team?.teamId ?? null,
        teamName: team?.team.name ?? null,
        isModerator: team?.isModerator ?? false,
      }));
    },
  };
  return repository;
}

export function createPrismaAuthRepository(prisma: PrismaClient): AuthRepository {
  return bind(prisma, prisma);
}
