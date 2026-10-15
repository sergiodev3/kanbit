import type { PrismaClient } from '../../generated/prisma/client';
import type { UsersRepository } from './users.service';

export function createPrismaUsersRepository(prisma: PrismaClient): UsersRepository {
  return {
    findStudentTaughtBy: (teacherId, studentId) =>
      prisma.user.findFirst({
        where: { id: studentId, role: 'STUDENT', groupMemberships: { some: { group: { teacherId } } } },
        select: { id: true },
      }),

    async updatePasswordHash(userId, passwordHash) {
      await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    },
  };
}
