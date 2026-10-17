import { type CardStatus, type Weekday, isValidPosition } from '@kanbit/shared';
import { AppError } from '../../http/errors';
import type { CardRecord } from './cards.service';

export const cardIncomplete = () =>
  new AppError(400, 'CARD_INCOMPLETE', 'Cards outside the backlog need an assignee, done criteria and a due weekday');
export const notATeamMember = () => new AppError(400, 'NOT_A_TEAM_MEMBER', 'The assignee must be a member of the team');
export const invalidPosition = () =>
  new AppError(400, 'INVALID_POSITION', 'The position is not a valid fractional index');

/** Where a card goes (`POST /cards/:id/move`): its target cell, position and the details it may need there. */
export interface MoveTarget {
  status: CardStatus;
  assigneeId: string | null;
  position: string;
  dueWeekday?: Weekday;
  doneCriteria?: string;
}

export interface MoveContext {
  now: Date;
  /** User ids of the team members; any assignee must be one of them. */
  memberIds: readonly string[];
}

/** Every card field a move rewrites. */
export type MoveChanges = Pick<
  CardRecord,
  | 'status'
  | 'assigneeId'
  | 'position'
  | 'doneCriteria'
  | 'dueWeekday'
  | 'sprintId'
  | 'validated'
  | 'validatedById'
  | 'completedAt'
>;

/** History rows a move produces (`CardEvent`); the acting user is added by the service. */
export type MoveEvent =
  | { type: 'MOVED'; fromStatus: CardStatus; toStatus: CardStatus }
  | { type: 'ASSIGNED'; fromStatus: null; toStatus: null };

export interface MovePlan {
  changes: MoveChanges;
  events: MoveEvent[];
}

const assigned: MoveEvent = { type: 'ASSIGNED', fromStatus: null, toStatus: null };

/**
 * History of an unfinished card sent back to the unassigned Backlog because its assignee left the team
 * (spec §6.1): MOVED unless it already was in the Backlog, then ASSIGNED (to nobody).
 */
export function releaseEvents(status: CardStatus): MoveEvent[] {
  return status === 'BACKLOG' ? [assigned] : [{ type: 'MOVED', fromStatus: status, toStatus: 'BACKLOG' }, assigned];
}

/**
 * Plans a card move (spec §6.1, §7.2, §9) without touching storage:
 * - outside the Backlog a card needs an assignee, a due weekday and done criteria (from the card or the request);
 * - any assignee must belong to the team;
 * - back to the Backlog drops the sprint and the validation (the assignee may stay);
 * - entering DONE stamps `completedAt`, leaving DONE clears it;
 * - otherwise `sprintId` is untouched (attaching a sprint belongs to the sprint cycle).
 * MOVED is recorded when the column changes and ASSIGNED when the row changes; a pure reorder records nothing.
 */
export function planMove(card: CardRecord, target: MoveTarget, { now, memberIds }: MoveContext): MovePlan {
  if (!isValidPosition(target.position)) throw invalidPosition();
  if (target.assigneeId !== null && !memberIds.includes(target.assigneeId)) throw notATeamMember();

  const doneCriteria = target.doneCriteria ?? card.doneCriteria;
  const dueWeekday = target.dueWeekday ?? card.dueWeekday;
  const toBacklog = target.status === 'BACKLOG';
  if (!toBacklog && (target.assigneeId === null || doneCriteria === null || dueWeekday === null)) {
    throw cardIncomplete();
  }

  let completedAt: Date | null = null;
  if (target.status === 'DONE') completedAt = card.status === 'DONE' ? (card.completedAt ?? now) : now;

  const events: MoveEvent[] = [];
  if (target.status !== card.status) {
    events.push({ type: 'MOVED', fromStatus: card.status, toStatus: target.status });
  }
  if (target.assigneeId !== card.assigneeId) events.push(assigned);

  return {
    changes: {
      status: target.status,
      assigneeId: target.assigneeId,
      position: target.position,
      doneCriteria,
      dueWeekday,
      sprintId: toBacklog ? null : card.sprintId,
      validated: toBacklog ? false : card.validated,
      validatedById: toBacklog ? null : card.validatedById,
      completedAt,
    },
    events,
  };
}
