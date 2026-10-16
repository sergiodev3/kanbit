import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { ProjectsRepository } from './projects.service';

const projectSelect = { id: true, teamId: true, name: true, updatedAt: true } satisfies Prisma.ProjectSelect;

export function createPrismaProjectsRepository(prisma: PrismaClient): ProjectsRepository {
  return {
    async findTeamAccess(teamId) {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { group: { select: { teacherId: true } }, members: { select: { userId: true, isModerator: true } } },
      });
      return team ? { teacherId: team.group.teacherId, members: team.members } : null;
    },

    listByTeam: (teamId) =>
      prisma.project.findMany({ where: { teamId }, orderBy: { createdAt: 'asc' }, select: projectSelect }),

    findById: (projectId) => prisma.project.findUnique({ where: { id: projectId }, select: projectSelect }),

    create: (data) => prisma.project.create({ data, select: projectSelect }),

    rename: (projectId, name) =>
      prisma.project.update({ where: { id: projectId }, data: { name }, select: projectSelect }),
  };
}
