import { describe, expect, it } from 'vitest';
import {
  CreateGroupRequest,
  CreateProjectRequest,
  CreateTeamRequest,
  GROUP_NAME_MAX_LENGTH,
  GroupDetailResponse,
  ProjectResponse,
  SetModeratorRequest,
  SetTeamMembersRequest,
  TEAM_MEMBERS_MAX,
  TeamResponse,
  UpdateGroupRequest,
  UpdateProjectRequest,
  UpdateTeamRequest,
} from '../src/index';

const ID_A = 'tz4a98xxat96iws9zmbrgj3a';
const ID_B = 'pfh0haxfpzowht3oi213cqos';
const UPDATED_AT = '2026-10-19T15:00:00.000Z';

describe('group schemas', () => {
  it('trims group names and rejects blank or oversized ones', () => {
    expect(CreateGroupRequest.parse({ name: '  5A Programacion ' })).toEqual({ name: '5A Programacion' });
    expect(CreateGroupRequest.safeParse({ name: '   ' }).success).toBe(false);
    expect(CreateGroupRequest.safeParse({ name: 'a'.repeat(GROUP_NAME_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it('patches only name and accessOpen, and requires at least one of them', () => {
    expect(UpdateGroupRequest.parse({ accessOpen: false })).toEqual({ accessOpen: false });
    expect(UpdateGroupRequest.parse({ name: ' 5B ', minTeamSize: 2 })).toEqual({ name: '5B' });
    expect(UpdateGroupRequest.safeParse({}).success).toBe(false);
    expect(UpdateGroupRequest.safeParse({ accessCode: 'ZZZZZZ' }).success).toBe(false);
    expect(UpdateGroupRequest.safeParse({ accessOpen: 'no' }).success).toBe(false);
  });

  it('describes the group detail with students and team summaries', () => {
    const detail = {
      id: ID_A,
      name: '5A',
      accessCode: 'AB23CD',
      accessOpen: true,
      updatedAt: UPDATED_AT,
      students: [{ id: ID_B, name: 'Ana', username: 'a0001', teamId: null }],
      teams: [{ id: ID_A, name: 'Los Bits', moderatorId: null, memberCount: 0 }],
    };
    expect(GroupDetailResponse.parse(detail)).toEqual(detail);
  });
});

describe('team schemas', () => {
  it('trims team names', () => {
    expect(CreateTeamRequest.parse({ name: ' Los Bits ' })).toEqual({ name: 'Los Bits' });
    expect(UpdateTeamRequest.safeParse({ name: '' }).success).toBe(false);
  });

  it('accepts an ordered list of distinct member ids, including an empty one', () => {
    expect(SetTeamMembersRequest.parse({ userIds: [ID_B, ID_A] })).toEqual({ userIds: [ID_B, ID_A] });
    expect(SetTeamMembersRequest.parse({ userIds: [] })).toEqual({ userIds: [] });
  });

  it('rejects duplicate, malformed or too many member ids', () => {
    expect(SetTeamMembersRequest.safeParse({ userIds: [ID_A, ID_A] }).success).toBe(false);
    expect(SetTeamMembersRequest.safeParse({ userIds: ['Not-A-Cuid!'] }).success).toBe(false);
    const tooMany = Array.from({ length: TEAM_MEMBERS_MAX + 1 }, (_, i) => `user${i}`);
    expect(SetTeamMembersRequest.safeParse({ userIds: tooMany }).success).toBe(false);
  });

  it('requires a moderator id', () => {
    expect(SetModeratorRequest.safeParse({ userId: ID_A }).success).toBe(true);
    expect(SetModeratorRequest.safeParse({}).success).toBe(false);
  });

  it('describes a team with ordered members and its moderator', () => {
    const team = {
      id: ID_A,
      groupId: ID_B,
      name: 'Los Bits',
      moderatorId: ID_B,
      updatedAt: UPDATED_AT,
      members: [{ userId: ID_B, name: 'Ana', username: 'a0001', isModerator: true, rowOrder: 0 }],
    };
    expect(TeamResponse.parse(team)).toEqual(team);
  });
});

describe('project schemas', () => {
  it('trims project names on create and rename', () => {
    expect(CreateProjectRequest.parse({ name: ' Kanbit ' })).toEqual({ name: 'Kanbit' });
    expect(UpdateProjectRequest.safeParse({ name: '  ' }).success).toBe(false);
  });

  it('describes a project', () => {
    const project = { id: ID_A, teamId: ID_B, name: 'Kanbit', updatedAt: UPDATED_AT };
    expect(ProjectResponse.parse(project)).toEqual(project);
    expect(ProjectResponse.safeParse({ ...project, updatedAt: 'yesterday' }).success).toBe(false);
  });
});
