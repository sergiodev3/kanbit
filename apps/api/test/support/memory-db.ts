import type { Membership, Role } from '@kanbit/shared';
import type { AuthRepository, UserRecord } from '../../src/modules/auth/auth.service';
import type { UsersRepository } from '../../src/modules/users/users.service';

interface GroupRow {
  id: string;
  name: string;
  accessCode: string;
  accessOpen: boolean;
  teacherId: string;
}

interface TeamMemberRow {
  teamId: string;
  teamName: string;
  groupId: string;
  userId: string;
  isModerator: boolean;
}

/** In-memory stand-in for the Prisma repositories so API tests run without a database. */
export class MemoryDb {
  readonly users: UserRecord[] = [];
  readonly groups: GroupRow[] = [];
  readonly groupMembers: { groupId: string; userId: string }[] = [];
  readonly teamMembers: TeamMemberRow[] = [];
  private seq = 0;

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
    const group: GroupRow = { id: `group${++this.seq}`, accessOpen: true, ...data };
    this.groups.push(group);
    return group;
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
      this.groupMembers.push({ groupId, userId: user.id });
      return user;
    },
    updatePasswordHash: async (userId, passwordHash) => this.setPasswordHash(userId, passwordHash),
    listMemberships: async (userId) =>
      this.groupMembers
        .filter((member) => member.userId === userId)
        .map((member): Membership => {
          const group = this.groups.find((row) => row.id === member.groupId);
          const team = this.teamMembers.find((row) => row.groupId === member.groupId && row.userId === userId);
          return {
            groupId: member.groupId,
            groupName: group?.name ?? '',
            teamId: team?.teamId ?? null,
            teamName: team?.teamName ?? null,
            isModerator: team?.isModerator ?? false,
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

  private setPasswordHash(userId: string, passwordHash: string): void {
    const user = this.users.find((row) => row.id === userId);
    if (user) user.passwordHash = passwordHash;
  }
}
