import type { CardStatus, SessionUser } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from './auth';
import { AppError } from './errors';

export const forbidden = () => new AppError(403, 'FORBIDDEN', 'Not allowed');
export const groupNotFound = () => new AppError(404, 'GROUP_NOT_FOUND', 'Group not found');
export const teamNotFound = () => new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
export const cardNotFound = () => new AppError(404, 'CARD_NOT_FOUND', 'Card not found');

/** Only teachers pass (spec §3). Mount after `requireAuth`. */
export const requireTeacher: RequestHandler = (req, _res, next) => {
  if (currentUser(req).role !== 'TEACHER') throw forbidden();
  next();
};

/** What authorization needs to know about a group. */
export interface GroupAccess {
  teacherId: string;
}

/** What authorization needs to know about a team: its group's teacher and its members. */
export interface TeamAccess {
  teacherId: string;
  members: readonly { userId: string; isModerator: boolean }[];
}

// Pure predicates over loaded data (spec §3).

export const isGroupTeacher = (user: SessionUser, group: GroupAccess): boolean =>
  user.role === 'TEACHER' && group.teacherId === user.id;

export const isTeamMember = (user: SessionUser, team: TeamAccess): boolean =>
  team.members.some((member) => member.userId === user.id);

export const isTeamModerator = (user: SessionUser, team: TeamAccess): boolean =>
  team.members.some((member) => member.userId === user.id && member.isModerator);

export const canViewTeam = (user: SessionUser, team: TeamAccess): boolean =>
  isGroupTeacher(user, team) || isTeamMember(user, team);

export const canManageTeamProjects = (user: SessionUser, team: TeamAccess): boolean =>
  isGroupTeacher(user, team) || isTeamModerator(user, team);

/** Closing the sprint (spec §3): the moderator or the group's teacher. */
export const canCloseSprint = (user: SessionUser, team: TeamAccess): boolean =>
  isGroupTeacher(user, team) || isTeamModerator(user, team);

/** What authorization needs to know about a card. */
export interface CardAccess {
  assigneeId: string | null;
  status: CardStatus;
}

/** The board cell a card is moved to. */
export interface CardTarget {
  assigneeId: string | null;
  status: CardStatus;
}

/** A member's own card, or an unassigned Backlog card any member may take. */
const ownsOrMayClaim = (user: SessionUser, card: CardAccess): boolean =>
  card.assigneeId === user.id || (card.assigneeId === null && card.status === 'BACKLOG');

/**
 * Who may edit or delete a card (spec §3): the moderator, the card's assignee, or any member while the card is
 * an unassigned Backlog card. The teacher is read-only.
 */
export const canEditCard = (user: SessionUser, team: TeamAccess, card: CardAccess): boolean =>
  isTeamModerator(user, team) || (isTeamMember(user, team) && ownsOrMayClaim(user, card));

/**
 * Who may change a card's content (title, done criteria, due day, project): whoever may edit it, except that a
 * validated card is the moderator's to change, so the criteria the moderator approved cannot move under them.
 */
export const canEditCardContent = (
  user: SessionUser,
  team: TeamAccess,
  card: CardAccess & { validated: boolean },
): boolean => isTeamModerator(user, team) || (canEditCard(user, team, card) && !card.validated);

/**
 * Who may move a card where (spec §3): the moderator moves any card to any row; a member moves the cards they
 * may edit (their own, or an unassigned one they claim) only into their own row, or back to the unassigned
 * Backlog. The teacher is read-only.
 */
export const canMoveCard = (user: SessionUser, team: TeamAccess, card: CardAccess, target: CardTarget): boolean =>
  isTeamModerator(user, team) ||
  (canEditCard(user, team, card) &&
    (target.assigneeId === user.id || (target.assigneeId === null && target.status === 'BACKLOG')));

// Asserts: resources the user cannot see are reported as missing (404) so ids cannot be probed;
// visible resources the user cannot act on are 403.

type NotFound = () => AppError;

export function assertGroupTeacher<T extends GroupAccess>(
  user: SessionUser,
  group: T | null,
  notFound: NotFound = groupNotFound,
): asserts group is T {
  if (!group || !isGroupTeacher(user, group)) throw notFound();
}

export function assertTeamTeacher<T extends TeamAccess>(
  user: SessionUser,
  team: T | null,
  notFound: NotFound = teamNotFound,
): asserts team is T {
  if (!team || !isGroupTeacher(user, team)) throw notFound();
}

export function assertTeamMemberOrTeacher<T extends TeamAccess>(
  user: SessionUser,
  team: T | null,
  notFound: NotFound = teamNotFound,
): asserts team is T {
  if (!team || !canViewTeam(user, team)) throw notFound();
}

export function assertModeratorOrTeacher<T extends TeamAccess>(
  user: SessionUser,
  team: T | null,
  notFound: NotFound = teamNotFound,
): asserts team is T {
  assertTeamMemberOrTeacher(user, team, notFound);
  if (!canManageTeamProjects(user, team)) throw forbidden();
}

/** Moderator-only team actions (starting the sprint): the teacher and plain members get 403. */
export function assertTeamModerator<T extends TeamAccess>(
  user: SessionUser,
  team: T | null,
  notFound: NotFound = teamNotFound,
): asserts team is T {
  assertTeamMemberOrTeacher(user, team, notFound);
  if (!isTeamModerator(user, team)) throw forbidden();
}

/** Closing a sprint: hidden from non-members, 403 for plain members. */
export function assertCanCloseSprint<T extends TeamAccess>(
  user: SessionUser,
  team: T | null,
  notFound: NotFound,
): asserts team is T {
  assertTeamMemberOrTeacher(user, team, notFound);
  if (!canCloseSprint(user, team)) throw forbidden();
}

/** Moving a card: hidden from non-members (404 CARD_NOT_FOUND), 403 when `canMoveCard` refuses. */
export function assertCanMoveCard<T extends TeamAccess>(
  user: SessionUser,
  team: T | null,
  card: CardAccess,
  target: CardTarget,
  notFound: NotFound = cardNotFound,
): asserts team is T {
  assertTeamMemberOrTeacher(user, team, notFound);
  if (!canMoveCard(user, team, card, target)) throw forbidden();
}
