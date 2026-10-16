import type { CardStatus, Membership, Role } from '@kanbit/shared';
import type { AuthRepository, UserRecord } from '../../src/modules/auth/auth.service';
import type { GroupRecord, GroupsRepository } from '../../src/modules/groups/groups.service';
import type { ProjectsRepository } from '../../src/modules/projects/projects.service';
import type { TeamRecord, TeamsRepository } from '../../src/modules/teams/teams.service';
import type { UsersRepository } from '../../src/modules/users/users.service';

interface GroupRow {
  id: string;
  name: string;
  accessCode: string;
  accessOpen: boolean;
  teacherId: string;
  updatedAt: Date;
}

interface TeamRow {
  id: string;
  name: string;
  groupId: string;
  updatedAt: Date;
}

interface TeamMemberRow {
  teamId: string;
  groupId: string;
  userId: string;
  isModerator: boolean;
  rowOrder: number;
}

interface ProjectRow {
  id: string;
  teamId: string;
  name: string;
  updatedAt: Date;
}

interface CardRow {
  id: string;
  teamId: string;
  assigneeId: string | null;
  sprintId: string | null;
  status: CardStatus;
  validated: boolean;
}

/** Mimics Prisma's P2002 so services exercise their unique-violation paths. */
export const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

/** In-memory stand-in for the Prisma repositories so API tests run without a database. */
export class MemoryDb {
  readonly users: UserRecord[] = [];
  readonly groups: GroupRow[] = [];
  readonly groupMembers: { groupId: string; userId: string }[] = [];
  readonly teams: TeamRow[] = [];
  readonly teamMembers: TeamMemberRow[] = [];
  readonly projects: ProjectRow[] = [];
  readonly cards: CardRow[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date('2026-10-19T15:00:00Z')) {}

  addUser(data: { username: string; name?: string; role: Role; passwordHash: string }): UserRecord {
    const user: UserRecord = {
      id: `user${++this.seq}`,
      name: data.name ?? data.username,
      username: data.username,
      role: data.role,
      passwordHash: data.passwordHash,
    };
    this.users.push(user);
    return user;
  }

  addGroup(data: { name: string; accessCode: string; teacherId: string; accessOpen?: boolean }): GroupRow {
    const group: GroupRow = { id: `group${++this.seq}`, accessOpen: true, updatedAt: this.now(), ...data };
    this.groups.push(group);
    return group;
  }

  addGroupMember(groupId: string, userId: string): void {
    this.groupMembers.push({ groupId, userId });
  }

  addTeam(data: { name: string; groupId: string }): TeamRow {
    const team: TeamRow = { id: `team${++this.seq}`, updatedAt: this.now(), ...data };
    this.teams.push(team);
    return team;
  }

  /** Adds a member row, enforcing the same unique keys as the database. */
  addTeamMember(data: { teamId: string; userId: string; isModerator?: boolean; rowOrder?: number }): void {
    const team = this.teams.find((row) => row.id === data.teamId);
    if (!team) throw new Error(`addTeamMember: unknown team ${data.teamId}`);
    const clash = this.teamMembers.some(
      (row) =>
        (row.teamId === team.id && row.userId === data.userId) ||
        (row.groupId === team.groupId && row.userId === data.userId),
    );
    if (clash) throw uniqueViolation();
    this.teamMembers.push({
      teamId: team.id,
      groupId: team.groupId,
      userId: data.userId,
      isModerator: data.isModerator ?? false,
      rowOrder: data.rowOrder ?? this.teamMembers.filter((row) => row.teamId === team.id).length,
    });
  }

  addProject(data: { teamId: string; name: string }): ProjectRow {
    const project: ProjectRow = { id: `project${++this.seq}`, updatedAt: this.now(), ...data };
    this.projects.push(project);
    return project;
  }

  addCard(data: { teamId: string; assigneeId: string | null; status: CardStatus; sprintId?: string | null }): CardRow {
    const card: CardRow = { id: `card${++this.seq}`, sprintId: null, validated: false, ...data };
    this.cards.push(card);
    return card;
  }

  removeUser(id: string): void {
    const index = this.users.findIndex((user) => user.id === id);
    if (index >= 0) this.users.splice(index, 1);
  }

  readonly authRepository: AuthRepository = {
    transaction: (fn) => fn(this.authRepository),
    findGroupByAccessCode: async (accessCode) => {
      const group = this.groups.find((row) => row.accessCode === accessCode);
      return group ? { id: group.id, accessOpen: group.accessOpen } : null;
    },
    findUserByUsername: async (username) => this.users.find((user) => user.username === username) ?? null,
    findUserById: async (id) => this.users.find((user) => user.id === id) ?? null,
    createStudent: async ({ groupId, ...data }) => {
      if (this.users.some((user) => user.username === data.username)) return null;
      const user = this.addUser({ ...data, role: 'STUDENT' });
      this.addGroupMember(groupId, user.id);
      return user;
    },
    updatePasswordHash: async (userId, passwordHash) => this.setPasswordHash(userId, passwordHash),
    listMemberships: async (userId) =>
      this.groupMembers
        .filter((member) => member.userId === userId)
        .map((member): Membership => {
          const group = this.groups.find((row) => row.id === member.groupId);
          const row = this.teamMembers.find((tm) => tm.groupId === member.groupId && tm.userId === userId);
          const team = row ? this.teams.find((t) => t.id === row.teamId) : undefined;
          return {
            groupId: member.groupId,
            groupName: group?.name ?? '',
            teamId: row?.teamId ?? null,
            teamName: team?.name ?? null,
            isModerator: row?.isModerator ?? false,
          };
        }),
  };

  readonly usersRepository: UsersRepository = {
    findStudentTaughtBy: async (teacherId, studentId) => {
      const student = this.users.find((user) => user.id === studentId && user.role === 'STUDENT');
      if (!student) return null;
      const taught = this.groupMembers.some(
        (member) =>
          member.userId === studentId &&
          this.groups.some((group) => group.id === member.groupId && group.teacherId === teacherId),
      );
      return taught ? { id: student.id } : null;
    },
    updatePasswordHash: async (userId, passwordHash) => this.setPasswordHash(userId, passwordHash),
  };

  readonly groupsRepository: GroupsRepository = {
    listByTeacher: async (teacherId) =>
      this.groups
        .filter((group) => group.teacherId === teacherId)
        .map((group) => ({
          ...group,
          teamCount: this.teams.filter((team) => team.groupId === group.id).length,
          studentCount: this.studentsOf(group.id).length,
        })),
    findById: async (id) => this.groupRecord(this.groups.find((group) => group.id === id)),
    findDetail: async (id) => {
      const group = this.groupRecord(this.groups.find((row) => row.id === id));
      if (!group) return null;
      const students = this.studentsOf(id)
        .map((user) => ({
          id: user.id,
          name: user.name,
          username: user.username,
          teamId: this.teamMembers.find((row) => row.groupId === id && row.userId === user.id)?.teamId ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const teams = this.teams
        .filter((team) => team.groupId === id)
        .map((team) => {
          const members = this.teamMembers.filter((row) => row.teamId === team.id);
          return {
            id: team.id,
            name: team.name,
            moderatorId: members.find((row) => row.isModerator)?.userId ?? null,
            memberCount: members.length,
          };
        });
      return { ...group, students, teams };
    },
    create: async (data) => {
      if (this.groups.some((group) => group.accessCode === data.accessCode)) return null;
      return this.groupRecord(this.addGroup(data));
    },
    update: async (id, data) => {
      const group = this.mustFind(this.groups, id);
      Object.assign(group, data, { updatedAt: this.now() });
      return { ...group };
    },
    setAccessCode: async (id, accessCode) => {
      if (this.groups.some((group) => group.accessCode === accessCode)) return null;
      const group = this.mustFind(this.groups, id);
      Object.assign(group, { accessCode, updatedAt: this.now() });
      return { ...group };
    },
  };

  readonly teamsRepository: TeamsRepository = {
    transaction: (fn) => fn(this.teamsRepository),
    findGroup: async (groupId) => {
      const group = this.groups.find((row) => row.id === groupId);
      return group ? { id: group.id, teacherId: group.teacherId } : null;
    },
    listByGroup: async (groupId) =>
      this.teams.filter((team) => team.groupId === groupId).map((team) => this.teamRecord(team)),
    findById: async (teamId) => {
      const team = this.teams.find((row) => row.id === teamId);
      return team ? this.teamRecord(team) : null;
    },
    create: async (data) => this.teamRecord(this.addTeam(data)),
    rename: async (teamId, name) => {
      Object.assign(this.mustFind(this.teams, teamId), { name, updatedAt: this.now() });
    },
    countCards: async (teamId) => this.cards.filter((card) => card.teamId === teamId).length,
    delete: async (teamId) => {
      const keep = <T extends { teamId: string }>(rows: T[]) => {
        const remaining = rows.filter((row) => row.teamId !== teamId);
        rows.splice(0, rows.length, ...remaining);
      };
      keep(this.teamMembers);
      keep(this.projects);
      this.teams.splice(this.teams.indexOf(this.mustFind(this.teams, teamId)), 1);
    },
    findGroupStudentIds: async (groupId, userIds) =>
      this.studentsOf(groupId)
        .map((user) => user.id)
        .filter((id) => userIds.includes(id)),
    applyMemberPlan: async (team, plan) => {
      const remaining = this.teamMembers.filter((row) => !(row.teamId === team.id && plan.remove.includes(row.userId)));
      this.teamMembers.splice(0, this.teamMembers.length, ...remaining);
      for (const { userId, rowOrder, isModerator } of plan.keep) {
        const row = this.teamMembers.find((tm) => tm.teamId === team.id && tm.userId === userId);
        if (!row) throw new Error(`applyMemberPlan: ${userId} is not in ${team.id}`);
        Object.assign(row, { rowOrder, isModerator });
      }
      for (const row of plan.create) this.addTeamMember({ teamId: team.id, ...row });
    },
    releaseUnfinishedCards: async (teamId, userIds) => {
      for (const card of this.cards) {
        if (card.teamId !== teamId || card.status === 'DONE') continue;
        if (card.assigneeId === null || !userIds.includes(card.assigneeId)) continue;
        Object.assign(card, { status: 'BACKLOG', assigneeId: null, sprintId: null, validated: false });
      }
    },
    setModerator: async (teamId, userId) => {
      for (const row of this.teamMembers) {
        if (row.teamId === teamId) row.isModerator = row.userId === userId;
      }
    },
  };

  readonly projectsRepository: ProjectsRepository = {
    findTeamAccess: async (teamId) => {
      const team = this.teams.find((row) => row.id === teamId);
      return team ? this.teamRecord(team) : null;
    },
    listByTeam: async (teamId) =>
      this.projects.filter((project) => project.teamId === teamId).map((project) => ({ ...project })),
    findById: async (projectId) => {
      const project = this.projects.find((row) => row.id === projectId);
      return project ? { ...project } : null;
    },
    create: async (data) => ({ ...this.addProject(data) }),
    rename: async (projectId, name) => {
      const project = this.mustFind(this.projects, projectId);
      Object.assign(project, { name, updatedAt: this.now() });
      return { ...project };
    },
  };

  private teamRecord(team: TeamRow): TeamRecord {
    const group = this.mustFind(this.groups, team.groupId);
    const members = this.teamMembers
      .filter((row) => row.teamId === team.id)
      .sort((a, b) => a.rowOrder - b.rowOrder)
      .map((row) => {
        const user = this.mustFind(this.users, row.userId);
        return {
          userId: row.userId,
          name: user.name,
          username: user.username,
          isModerator: row.isModerator,
          rowOrder: row.rowOrder,
        };
      });
    return { ...team, teacherId: group.teacherId, members };
  }

  private groupRecord(group: GroupRow | undefined): GroupRecord | null {
    return group ? { ...group } : null;
  }

  private studentsOf(groupId: string): UserRecord[] {
    return this.groupMembers
      .filter((member) => member.groupId === groupId)
      .map((member) => this.users.find((user) => user.id === member.userId))
      .filter((user): user is UserRecord => user?.role === 'STUDENT');
  }

  private mustFind<T extends { id: string }>(rows: T[], id: string): T {
    const row = rows.find((candidate) => candidate.id === id);
    // Mirrors Prisma's update-on-missing-row failure (P2025).
    if (!row) throw new Error(`Record ${id} not found`);
    return row;
  }

  private setPasswordHash(userId: string, passwordHash: string): void {
    const user = this.users.find((row) => row.id === userId);
    if (user) user.passwordHash = passwordHash;
  }
}
