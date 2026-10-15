import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { isUniqueViolation } from '../../lib/prisma';
import type { GroupRecord, GroupsRepository } from './groups.service';

const groupSelect = {
  id: true,
  name: true,
  accessCode: true,
  accessOpen: true,
  teacherId: true,
  updatedAt: true,
} satisfies Prisma.GroupSelect;

/** Runs a write that sets an access code; a unique violation means the code is taken. */
async function nullOnCodeCollision(write: () => Promise<GroupRecord>): Promise<GroupRecord | null> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

export function createPrismaGroupsRepository(prisma: PrismaClient): GroupsRepository {
  return {
    async listByTeacher(teacherId) {
      const groups = await prisma.group.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'asc' },
        select: { ...groupSelect, _count: { select: { teams: true, members: true } } },
      });
      return groups.map(({ _count, ...group }) => ({
        ...group,
        teamCount: _count.teams,
        studentCount: _count.members,
      }));
    },

    findById: (id) => prisma.group.findUnique({ where: { id }, select: groupSelect }),

    async findDetail(id) {
      const group = await prisma.group.findUnique({
        where: { id },
        select: {
          ...groupSelect,
          members: {
            where: { user: { role: 'STUDENT' } },
            orderBy: { user: { name: 'asc' } },
            select: {
              user: { select: { id: true, name: true, username: true } },
              // At most one row: one team per student per group (unique groupId + userId).
              teamMemberships: { select: { teamId: true } },
            },
          },
          teams: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, members: { select: { userId: true, isModerator: true } } },
          },
        },
      });
      if (!group) return null;
      const { members, teams, ...rest } = group;
      return {
        ...rest,
        students: members.map(({ user, teamMemberships: [team] }) => ({ ...user, teamId: team?.teamId ?? null })),
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          moderatorId: team.members.find((member) => member.isModerator)?.userId ?? null,
          memberCount: team.members.length,
        })),
      };
    },

    create: (data) => nullOnCodeCollision(() => prisma.group.create({ data, select: groupSelect })),

    update: (id, data) => prisma.group.update({ where: { id }, data, select: groupSelect }),

    setAccessCode: (id, accessCode) =>
      nullOnCodeCollision(() => prisma.group.update({ where: { id }, data: { accessCode }, select: groupSelect })),
  };
}
