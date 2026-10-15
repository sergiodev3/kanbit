import type {
  CreateGroupRequest,
  GroupDetailResponse,
  GroupResponse,
  GroupStudent,
  GroupSummaryResponse,
  SessionUser,
  TeamSummary,
  UpdateGroupRequest,
} from '@kanbit/shared';
import { assertGroupTeacher } from '../../http/authz';
import { generateAccessCode, withUniqueAccessCode } from '../../lib/access-code';

export interface GroupRecord {
  id: string;
  name: string;
  accessCode: string;
  accessOpen: boolean;
  teacherId: string;
  updatedAt: Date;
}

export interface GroupSummaryRecord extends GroupRecord {
  teamCount: number;
  studentCount: number;
}

export interface GroupDetailRecord extends GroupRecord {
  /** Ordered by name. */
  students: GroupStudent[];
  /** Ordered by creation. */
  teams: TeamSummary[];
}

/** Persistence port for groups; the Prisma adapter lives in `groups.repository.ts`. */
export interface GroupsRepository {
  listByTeacher(teacherId: string): Promise<GroupSummaryRecord[]>;
  findById(id: string): Promise<GroupRecord | null>;
  findDetail(id: string): Promise<GroupDetailRecord | null>;
  /** Null when the access code is already used by another group. */
  create(data: { name: string; teacherId: string; accessCode: string }): Promise<GroupRecord | null>;
  update(id: string, data: UpdateGroupRequest): Promise<GroupRecord>;
  /** Null when the access code is already used by another group. */
  setAccessCode(id: string, accessCode: string): Promise<GroupRecord | null>;
}

export interface GroupsService {
  list(actor: SessionUser): Promise<GroupSummaryResponse[]>;
  create(actor: SessionUser, input: CreateGroupRequest): Promise<GroupResponse>;
  get(actor: SessionUser, groupId: string): Promise<GroupDetailResponse>;
  update(actor: SessionUser, groupId: string, input: UpdateGroupRequest): Promise<GroupResponse>;
  regenerateAccessCode(actor: SessionUser, groupId: string): Promise<GroupResponse>;
}

export interface GroupsServiceDeps {
  repository: GroupsRepository;
  generateCode?: () => string;
}

const toGroupResponse = ({ id, name, accessCode, accessOpen, updatedAt }: GroupRecord): GroupResponse => ({
  id,
  name,
  accessCode,
  accessOpen,
  updatedAt: updatedAt.toISOString(),
});

/** Teacher-only group administration (spec §8.5.1); every method checks group ownership. */
export function createGroupsService({
  repository,
  generateCode = generateAccessCode,
}: GroupsServiceDeps): GroupsService {
  async function findOwned(actor: SessionUser, groupId: string): Promise<GroupRecord> {
    const group = await repository.findById(groupId);
    assertGroupTeacher(actor, group);
    return group;
  }

  return {
    async list(actor) {
      const groups = await repository.listByTeacher(actor.id);
      return groups.map((group) => ({
        ...toGroupResponse(group),
        teamCount: group.teamCount,
        studentCount: group.studentCount,
      }));
    },

    async create(actor, { name }) {
      const group = await withUniqueAccessCode(
        (accessCode) => repository.create({ name, teacherId: actor.id, accessCode }),
        generateCode,
      );
      return toGroupResponse(group);
    },

    async get(actor, groupId) {
      const group = await repository.findDetail(groupId);
      assertGroupTeacher(actor, group);
      return { ...toGroupResponse(group), students: group.students, teams: group.teams };
    },

    async update(actor, groupId, input) {
      await findOwned(actor, groupId);
      return toGroupResponse(await repository.update(groupId, input));
    },

    async regenerateAccessCode(actor, groupId) {
      await findOwned(actor, groupId);
      const group = await withUniqueAccessCode(
        (accessCode) => repository.setAccessCode(groupId, accessCode),
        generateCode,
      );
      return toGroupResponse(group);
    },
  };
}
