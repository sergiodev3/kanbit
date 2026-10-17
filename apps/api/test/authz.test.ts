import type { SessionUser } from '@kanbit/shared';
import { describe, expect, it } from 'vitest';
import {
  assertGroupTeacher,
  assertModeratorOrTeacher,
  assertTeamMemberOrTeacher,
  assertTeamTeacher,
  canEditCard,
  canManageTeamProjects,
  canViewTeam,
  isGroupTeacher,
  type TeamAccess,
} from '../src/http/authz';
import { AppError } from '../src/http/errors';

const user = (id: string, role: SessionUser['role']): SessionUser => ({ id, name: id, username: id, role });
const teacher = user('teacher1', 'TEACHER');
const otherTeacher = user('teacher2', 'TEACHER');
const moderator = user('ana', 'STUDENT');
const member = user('beto', 'STUDENT');
const outsider = user('carla', 'STUDENT');

const team: TeamAccess = {
  teacherId: 'teacher1',
  members: [
    { userId: 'ana', isModerator: true },
    { userId: 'beto', isModerator: false },
  ],
};

/** Runs `fn` and returns the AppError it throws (status + code), or null when it passes. */
function outcome(fn: () => void): { status: number; code: string } | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AppError) return { status: err.status, code: err.code };
    throw err;
  }
}

describe('authorization predicates', () => {
  it('recognises only the teacher who owns the group', () => {
    expect(isGroupTeacher(teacher, { teacherId: 'teacher1' })).toBe(true);
    expect(isGroupTeacher(otherTeacher, { teacherId: 'teacher1' })).toBe(false);
    // A student id equal to teacherId never passes: the role is checked too.
    expect(isGroupTeacher(user('teacher1', 'STUDENT'), { teacherId: 'teacher1' })).toBe(false);
  });

  it('lets the group teacher and team members view a team', () => {
    expect(canViewTeam(teacher, team)).toBe(true);
    expect(canViewTeam(member, team)).toBe(true);
    expect(canViewTeam(outsider, team)).toBe(false);
    expect(canViewTeam(otherTeacher, team)).toBe(false);
  });

  it('lets only the group teacher and the moderator manage projects (spec §3)', () => {
    expect(canManageTeamProjects(teacher, team)).toBe(true);
    expect(canManageTeamProjects(moderator, team)).toBe(true);
    expect(canManageTeamProjects(member, team)).toBe(false);
    expect(canManageTeamProjects(outsider, team)).toBe(false);
  });

  it('lets the moderator, the assignee, or any member of an unassigned backlog card edit it', () => {
    const unassignedBacklog = { assigneeId: null, status: 'BACKLOG' } as const;
    const betosTodo = { assigneeId: 'beto', status: 'TODO' } as const;
    const anasBacklog = { assigneeId: 'ana', status: 'BACKLOG' } as const;

    expect(canEditCard(moderator, team, betosTodo)).toBe(true);
    expect(canEditCard(member, team, betosTodo)).toBe(true);
    expect(canEditCard(member, team, unassignedBacklog)).toBe(true);
    expect(canEditCard(member, team, anasBacklog)).toBe(false);
    // The teacher reads the board but never edits cards (spec §3).
    expect(canEditCard(teacher, team, unassignedBacklog)).toBe(false);
    expect(canEditCard(outsider, team, unassignedBacklog)).toBe(false);
    // An assignee who left the team keeps no rights over the card.
    expect(canEditCard(outsider, team, { assigneeId: 'carla', status: 'TODO' })).toBe(false);
  });
});

describe('authorization asserts', () => {
  it('hides groups the teacher does not own as 404', () => {
    expect(outcome(() => assertGroupTeacher(teacher, { teacherId: 'teacher1' }))).toBeNull();
    expect(outcome(() => assertGroupTeacher(otherTeacher, { teacherId: 'teacher1' }))).toEqual({
      status: 404,
      code: 'GROUP_NOT_FOUND',
    });
    expect(outcome(() => assertGroupTeacher(teacher, null))).toEqual({ status: 404, code: 'GROUP_NOT_FOUND' });
  });

  it('hides teams of other teachers as 404', () => {
    expect(outcome(() => assertTeamTeacher(teacher, team))).toBeNull();
    expect(outcome(() => assertTeamTeacher(otherTeacher, team))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
    expect(outcome(() => assertTeamTeacher(teacher, null))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
  });

  it('hides a team from non-members as 404', () => {
    expect(outcome(() => assertTeamMemberOrTeacher(member, team))).toBeNull();
    expect(outcome(() => assertTeamMemberOrTeacher(teacher, team))).toBeNull();
    expect(outcome(() => assertTeamMemberOrTeacher(outsider, team))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
  });

  it('forbids plain members (403) and hides the team from outsiders (404) for moderator actions', () => {
    expect(outcome(() => assertModeratorOrTeacher(moderator, team))).toBeNull();
    expect(outcome(() => assertModeratorOrTeacher(teacher, team))).toBeNull();
    expect(outcome(() => assertModeratorOrTeacher(member, team))).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(outcome(() => assertModeratorOrTeacher(outsider, team))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
  });

  it('reports the caller-chosen not-found error', () => {
    const projectNotFound = () => new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found');
    expect(outcome(() => assertModeratorOrTeacher(outsider, team, projectNotFound))).toEqual({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
  });
});
