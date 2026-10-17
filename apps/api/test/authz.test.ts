import type { SessionUser } from '@kanbit/shared';
import { describe, expect, it } from 'vitest';
import {
  assertGroupTeacher,
  assertModeratorOrTeacher,
  assertTeamMemberOrTeacher,
  assertCanMoveCard,
  assertTeamTeacher,
  assertTeamModerator,
  assertCanCloseSprint,
  canCloseSprint,
  canEditCard,
  canEditCardContent,
  canMoveCard,
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

  it('locks the content of a validated card for everyone but the moderator', () => {
    const betosDoing = { assigneeId: 'beto', status: 'DOING', validated: true } as const;
    const betosTodo = { assigneeId: 'beto', status: 'TODO', validated: false } as const;

    expect(canEditCardContent(moderator, team, betosDoing)).toBe(true);
    expect(canEditCardContent(member, team, betosDoing)).toBe(false);
    expect(canEditCardContent(member, team, betosTodo)).toBe(true);
    expect(canEditCardContent(teacher, team, betosTodo)).toBe(false);
  });
});

describe('canMoveCard (spec §3)', () => {
  const betosTodo = { assigneeId: 'beto', status: 'TODO' } as const;
  const anasTodo = { assigneeId: 'ana', status: 'TODO' } as const;
  const unassigned = { assigneeId: null, status: 'BACKLOG' } as const;
  const to = (status: 'BACKLOG' | 'TODO' | 'DOING' | 'DONE', assigneeId: string | null) => ({ status, assigneeId });

  it('lets a member move their own card within their row or back to the unassigned backlog', () => {
    expect(canMoveCard(member, team, betosTodo, to('DOING', 'beto'))).toBe(true);
    expect(canMoveCard(member, team, betosTodo, to('BACKLOG', 'beto'))).toBe(true);
    expect(canMoveCard(member, team, betosTodo, to('BACKLOG', null))).toBe(true);
  });

  it('lets a member claim an unassigned card into their own row only', () => {
    expect(canMoveCard(member, team, unassigned, to('TODO', 'beto'))).toBe(true);
    expect(canMoveCard(member, team, unassigned, to('BACKLOG', 'beto'))).toBe(true);
    expect(canMoveCard(member, team, unassigned, to('BACKLOG', null))).toBe(true);
    expect(canMoveCard(member, team, unassigned, to('TODO', 'ana'))).toBe(false);
  });

  it("refuses a member moving another member's card or their own into another row", () => {
    expect(canMoveCard(member, team, anasTodo, to('DOING', 'ana'))).toBe(false);
    expect(canMoveCard(member, team, anasTodo, to('TODO', 'beto'))).toBe(false);
    expect(canMoveCard(member, team, betosTodo, to('TODO', 'ana'))).toBe(false);
    // Unassigned outside the backlog is never a valid target for a member.
    expect(canMoveCard(member, team, betosTodo, to('TODO', null))).toBe(false);
  });

  it('lets the moderator move any card to any row', () => {
    expect(canMoveCard(moderator, team, betosTodo, to('DONE', 'beto'))).toBe(true);
    expect(canMoveCard(moderator, team, betosTodo, to('TODO', 'ana'))).toBe(true);
    expect(canMoveCard(moderator, team, unassigned, to('TODO', 'beto'))).toBe(true);
  });

  it('refuses the teacher and outsiders', () => {
    expect(canMoveCard(teacher, team, unassigned, to('BACKLOG', null))).toBe(false);
    expect(canMoveCard(outsider, team, unassigned, to('BACKLOG', null))).toBe(false);
  });

  it('hides the card from outsiders (404 CARD_NOT_FOUND) and forbids the teacher and other members (403)', () => {
    expect(outcome(() => assertCanMoveCard(member, team, betosTodo, to('DOING', 'beto')))).toBeNull();
    expect(outcome(() => assertCanMoveCard(outsider, team, betosTodo, to('DOING', 'beto')))).toEqual({
      status: 404,
      code: 'CARD_NOT_FOUND',
    });
    expect(outcome(() => assertCanMoveCard(otherTeacher, team, betosTodo, to('DOING', 'beto')))).toEqual({
      status: 404,
      code: 'CARD_NOT_FOUND',
    });
    expect(outcome(() => assertCanMoveCard(member, null, betosTodo, to('DOING', 'beto')))).toEqual({
      status: 404,
      code: 'CARD_NOT_FOUND',
    });
    expect(outcome(() => assertCanMoveCard(teacher, team, betosTodo, to('DOING', 'beto')))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(outcome(() => assertCanMoveCard(member, team, anasTodo, to('DOING', 'ana')))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
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

describe('sprint authorization (spec §3)', () => {
  const sprintNotFound = () => new AppError(404, 'SPRINT_NOT_FOUND', 'Sprint not found');

  it('lets only the moderator start a sprint: teacher and members 403, outsiders 404', () => {
    expect(outcome(() => assertTeamModerator(moderator, team))).toBeNull();
    expect(outcome(() => assertTeamModerator(teacher, team))).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(outcome(() => assertTeamModerator(member, team))).toEqual({ status: 403, code: 'FORBIDDEN' });
    expect(outcome(() => assertTeamModerator(outsider, team))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
    expect(outcome(() => assertTeamModerator(otherTeacher, team))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
    expect(outcome(() => assertTeamModerator(moderator, null))).toEqual({ status: 404, code: 'TEAM_NOT_FOUND' });
  });

  it('lets the moderator or the group teacher close a sprint', () => {
    expect(canCloseSprint(moderator, team)).toBe(true);
    expect(canCloseSprint(teacher, team)).toBe(true);
    expect(canCloseSprint(member, team)).toBe(false);
    expect(canCloseSprint(otherTeacher, team)).toBe(false);

    expect(outcome(() => assertCanCloseSprint(teacher, team, sprintNotFound))).toBeNull();
    expect(outcome(() => assertCanCloseSprint(member, team, sprintNotFound))).toEqual({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(outcome(() => assertCanCloseSprint(outsider, team, sprintNotFound))).toEqual({
      status: 404,
      code: 'SPRINT_NOT_FOUND',
    });
  });
});
