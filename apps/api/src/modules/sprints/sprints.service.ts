import type { CardStatus, CloseSprintResponse, SessionUser, SprintResponse, StartSprintRequest } from '@kanbit/shared';
import { type TeamAccess, assertCanCloseSprint, assertTeamModerator } from '../../http/authz';
import { AppError } from '../../http/errors';
import type { Clock, IsoDate } from '../../lib/clock';
import { isUniqueViolation } from '../../lib/prisma';
import type { CardRecord, NewCardEvent, SprintRecord } from '../cards/cards.service';
import { type BacklogReturn, planClose, planSprintStart } from './sprint.rules';

export interface TeamSprintRecord extends SprintRecord {
  teamId: string;
}

export interface SprintTeamRecord extends TeamAccess {
  id: string;
  /** The group's IANA time zone (spec §7.1). */
  timezone: string;
}

export interface NewSprint {
  teamId: string;
  number: number;
  startDate: IsoDate;
  endDate: IsoDate;
  goal: string;
}

/** Persistence port for sprints; the Prisma adapter lives in `sprints.repository.ts`. */
export interface SprintsRepository {
  transaction<T>(fn: (repository: SprintsRepository) => Promise<T>): Promise<T>;
  findTeam(teamId: string): Promise<SprintTeamRecord | null>;
  findSprint(sprintId: string): Promise<TeamSprintRecord | null>;
  hasOpenSprint(teamId: string): Promise<boolean>;
  /** Highest sprint number of the team, or null before its first sprint. */
  lastSprintNumber(teamId: string): Promise<number | null>;
  /**
   * Inserts an OPEN sprint with a server-generated id. Throws a unique violation (P2002) when the team already has
   * an OPEN sprint or the number is taken.
   */
  createSprint(sprint: NewSprint): Promise<TeamSprintRecord>;
  /** Attaches the team's cards outside the Backlog that have no sprint to `sprintId`; validation is untouched. */
  adoptOrphanCards(teamId: string, sprintId: string, now: Date): Promise<void>;
  /** Closes the sprint only while it is still OPEN; null when it was not. */
  closeSprint(sprintId: string, now: Date): Promise<TeamSprintRecord | null>;
  /** Cards of the sprint that are not DONE, in no particular order. */
  listUnfinishedCards(sprintId: string): Promise<CardRecord[]>;
  /** Positions of the cards in one board cell (team, assignee, status), in no particular order. */
  listCellPositions(teamId: string, cell: { assigneeId: string | null; status: CardStatus }): Promise<string[]>;
  /**
   * Rewrites a card of `sprintId` only while its `updatedAt` still equals `version`; false when it changed or left
   * the sprint meanwhile.
   */
  returnCardToBacklog(
    cardId: string,
    sprintId: string,
    version: Date,
    changes: BacklogReturn & { updatedAt: Date },
  ): Promise<boolean>;
  addEvent(event: NewCardEvent): Promise<void>;
}

export interface SprintsService {
  start(actor: SessionUser, teamId: string, input: StartSprintRequest): Promise<SprintResponse>;
  close(actor: SessionUser, sprintId: string): Promise<CloseSprintResponse>;
}

export interface SprintsServiceDeps {
  repository: SprintsRepository;
  clock: Clock;
}

export const sprintNotFound = () => new AppError(404, 'SPRINT_NOT_FOUND', 'Sprint not found');
const sprintAlreadyOpen = () => new AppError(409, 'SPRINT_ALREADY_OPEN', 'The team already has an open sprint');
const sprintClosed = () => new AppError(409, 'SPRINT_CLOSED', 'The sprint is already closed');
const cardConflict = () =>
  new AppError(409, 'CARD_CONFLICT', 'A card changed while the sprint was closing; reload and retry');

const toSprintResponse = (sprint: TeamSprintRecord): SprintResponse => ({
  id: sprint.id,
  teamId: sprint.teamId,
  number: sprint.number,
  startDate: sprint.startDate,
  endDate: sprint.endDate,
  goal: sprint.goal,
  status: sprint.status,
  updatedAt: sprint.updatedAt.toISOString(),
});

/** The weekly sprint cycle (spec §7.2): start with a goal, simple close. */
export function createSprintsService({ repository, clock }: SprintsServiceDeps): SprintsService {
  return {
    async start(actor, teamId, { goal }) {
      const team = await repository.findTeam(teamId);
      assertTeamModerator(actor, team);
      const week = clock.sprintWeek(team.timezone);

      try {
        const sprint = await repository.transaction(async (tx) => {
          if (await tx.hasOpenSprint(teamId)) throw sprintAlreadyOpen();
          const plan = planSprintStart(await tx.lastSprintNumber(teamId), week, goal);
          const created = await tx.createSprint({ teamId, ...plan });
          await tx.adoptOrphanCards(teamId, created.id, clock.now());
          return created;
        });
        return toSprintResponse(sprint);
      } catch (err) {
        // A concurrent start won the one-OPEN-per-team index or the (teamId, number) key.
        if (isUniqueViolation(err)) throw sprintAlreadyOpen();
        throw err;
      }
    },

    async close(actor, sprintId) {
      return repository.transaction(async (tx) => {
        const sprint = await tx.findSprint(sprintId);
        if (!sprint) throw sprintNotFound();
        assertCanCloseSprint(actor, await tx.findTeam(sprint.teamId), sprintNotFound);
        if (sprint.status === 'CLOSED') throw sprintClosed();

        const now = clock.now();
        // Closing first locks the sprint row: a concurrent close waits here and then finds it CLOSED.
        const closed = await tx.closeSprint(sprintId, now);
        if (!closed) throw sprintClosed();

        const cards = await tx.listUnfinishedCards(sprintId);
        const backlogPositions = new Map<string | null, readonly string[]>();
        for (const assigneeId of new Set(cards.map((card) => card.assigneeId))) {
          const cell = { assigneeId, status: 'BACKLOG' } as const;
          backlogPositions.set(assigneeId, await tx.listCellPositions(sprint.teamId, cell));
        }

        const plan = planClose(cards, backlogPositions);
        for (const { cardId, version, changes } of plan.changes) {
          const updated = await tx.returnCardToBacklog(cardId, sprintId, version, { ...changes, updatedAt: now });
          if (!updated) throw cardConflict();
        }
        for (const event of plan.events) await tx.addEvent({ userId: actor.id, ...event });

        return { sprint: toSprintResponse(closed), returnedCardIds: plan.changes.map((change) => change.cardId) };
      });
    },
  };
}
