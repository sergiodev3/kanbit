import { type CardStatus, comparePositions, positionBetween } from '@kanbit/shared';
import type { IsoDate, WeekBounds } from '../../lib/clock';
import { type CardRecord, compareBoardCards } from '../cards/cards.service';

/** A new sprint: the server fills in the team and the id. */
export interface SprintStartPlan {
  number: number;
  startDate: IsoDate;
  endDate: IsoDate;
  goal: string;
}

/** Numbers sprints 1, 2, 3... per team and spans the sprint week (spec §6, §7.2). */
export function planSprintStart(lastNumber: number | null, week: WeekBounds, goal: string): SprintStartPlan {
  return { number: (lastNumber ?? 0) + 1, startDate: week.monday, endDate: week.friday, goal };
}

/** Fields rewritten on an unfinished card when its sprint closes. */
export interface BacklogReturn {
  status: 'BACKLOG';
  sprintId: null;
  validated: false;
  validatedById: null;
  position: string;
}

export interface CloseCardChange {
  cardId: string;
  /** The card's `updatedAt` when planned (optimistic lock). */
  version: Date;
  changes: BacklogReturn;
}

/** History rows of a close (`CardEvent`); the acting user is added by the service. */
export interface CloseEvent {
  cardId: string;
  type: 'MOVED';
  fromStatus: CardStatus;
  toStatus: 'BACKLOG';
}

export interface ClosePlan {
  changes: CloseCardChange[];
  events: CloseEvent[];
}

/**
 * Simple close (spec §7.2, §12.1): every unfinished card goes back to the Backlog keeping its assignee, without
 * sprint or validation, appended in board order after the last card of its (assignee, BACKLOG) cell. DONE cards keep
 * the sprint. `backlogPositions` holds the current positions of each assignee's Backlog cell (missing = empty).
 */
export function planClose(
  cards: readonly CardRecord[],
  backlogPositions: ReadonlyMap<string | null, readonly string[]>,
): ClosePlan {
  const lastByCell = new Map<string | null, string | null>();
  const lastOf = (assigneeId: string | null): string | null => {
    if (!lastByCell.has(assigneeId)) {
      const positions = [...(backlogPositions.get(assigneeId) ?? [])].sort(comparePositions);
      lastByCell.set(assigneeId, positions.at(-1) ?? null);
    }
    return lastByCell.get(assigneeId) ?? null;
  };

  const plan: ClosePlan = { changes: [], events: [] };
  for (const card of cards.filter((row) => row.status !== 'DONE').sort(compareBoardCards)) {
    const position = positionBetween(lastOf(card.assigneeId), null);
    lastByCell.set(card.assigneeId, position);
    plan.changes.push({
      cardId: card.id,
      version: card.updatedAt,
      changes: { status: 'BACKLOG', sprintId: null, validated: false, validatedById: null, position },
    });
    if (card.status !== 'BACKLOG') {
      plan.events.push({ cardId: card.id, type: 'MOVED', fromStatus: card.status, toStatus: 'BACKLOG' });
    }
  }
  return plan;
}
