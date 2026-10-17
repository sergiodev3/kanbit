import { z } from 'zod';
import { CardStatus, SprintStatus, Weekday } from './enums';
import { cuid2Id } from './ids';
import { isValidPosition } from './position';
import { ProjectResponse } from './projects';
import { TeamMemberResponse } from './teams';

/** Text limits from spec §6.1. */
export const CARD_TITLE_MAX_LENGTH = 140;
export const DONE_CRITERIA_MAX_LENGTH = 200;

export const CardTitle = z.string().trim().min(1).max(CARD_TITLE_MAX_LENGTH);

/** One line saying how to know the card is finished (spec §2.5). */
export const DoneCriteria = z.string().trim().min(1).max(DONE_CRITERIA_MAX_LENGTH);

/** Done criteria that may be cleared: blank text and null both mean "none". */
const ClearableDoneCriteria = z
  .string()
  .trim()
  .max(DONE_CRITERIA_MAX_LENGTH)
  .nullable()
  .transform((value) => (value ? value : null));

/** Fractional index within a board cell; see `positionBetween`. */
export const CardPosition = z.string().refine(isValidPosition, { message: 'Invalid position' });

const isoTimestamp = z.iso.datetime();

/**
 * `POST /teams/:id/cards`. The client generates the id (spec §5.3.1). New cards always land in the team
 * Backlog, unassigned ("Sin asignar"): spec §3 only grants creating cards in the Backlog, and taking a card
 * into a member's row is a move (`POST /cards/:id/move`), where the move permissions apply.
 */
export const CreateCardRequest = z.object({
  id: cuid2Id,
  projectId: cuid2Id,
  title: CardTitle,
  doneCriteria: ClearableDoneCriteria.optional(),
  dueWeekday: Weekday.optional(),
});
export type CreateCardRequest = z.infer<typeof CreateCardRequest>;

/** `PATCH /cards/:id`: content fields only; status, assignee and position change through `/move`. */
export const UpdateCardRequest = z
  .object({
    title: CardTitle.optional(),
    doneCriteria: ClearableDoneCriteria.optional(),
    dueWeekday: Weekday.nullable().optional(),
    projectId: cuid2Id.optional(),
    /** Optimistic concurrency (spec §5.3.1): 409 when the card changed since this `updatedAt`. */
    expectedUpdatedAt: isoTimestamp.optional(),
  })
  .refine(
    ({ title, doneCriteria, dueWeekday, projectId }) =>
      [title, doneCriteria, dueWeekday, projectId].some((value) => value !== undefined),
    { message: 'Provide at least one field to update' },
  );
export type UpdateCardRequest = z.infer<typeof UpdateCardRequest>;

/** `POST /cards/:id/move`: target cell (status + assignee) and the position computed by the client. */
export const MoveCardRequest = z.object({
  status: CardStatus,
  assigneeId: cuid2Id.nullable(),
  position: CardPosition,
  dueWeekday: Weekday.optional(),
  doneCriteria: DoneCriteria.optional(),
  expectedUpdatedAt: isoTimestamp.optional(),
});
export type MoveCardRequest = z.infer<typeof MoveCardRequest>;

export const CardResponse = z.object({
  id: cuid2Id,
  teamId: cuid2Id,
  projectId: cuid2Id,
  /** null = backlog. */
  sprintId: cuid2Id.nullable(),
  /** null = unassigned (only in BACKLOG). */
  assigneeId: cuid2Id.nullable(),
  title: z.string(),
  doneCriteria: z.string().nullable(),
  dueWeekday: Weekday.nullable(),
  status: CardStatus,
  position: z.string(),
  validated: z.boolean(),
  validatedById: cuid2Id.nullable(),
  carriedOverCount: z.number().int().nonnegative(),
  completedAt: isoTimestamp.nullable(),
  createdById: cuid2Id,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});
export type CardResponse = z.infer<typeof CardResponse>;

/** Calendar date `YYYY-MM-DD`. */
const isoDate = z.iso.date();

export const BoardSprint = z.object({
  id: cuid2Id,
  number: z.number().int().positive(),
  /** Monday of the sprint week. */
  startDate: isoDate,
  /** Friday of the sprint week. */
  endDate: isoDate,
  goal: z.string().nullable(),
  status: SprintStatus,
  updatedAt: isoTimestamp,
});
export type BoardSprint = z.infer<typeof BoardSprint>;

export const BoardTeam = z.object({
  id: cuid2Id,
  name: z.string(),
  groupId: cuid2Id,
  moderatorId: cuid2Id.nullable(),
});
export type BoardTeam = z.infer<typeof BoardTeam>;

/**
 * `GET /teams/:id/board`. `members` are the rows, ordered by `rowOrder`; `sprint` is the open sprint or null;
 * `cards` are the backlog plus the open sprint's cards, sorted by column then bytewise position.
 */
export const BoardResponse = z.object({
  team: BoardTeam,
  members: z.array(TeamMemberResponse),
  sprint: BoardSprint.nullable(),
  projects: z.array(ProjectResponse),
  cards: z.array(CardResponse),
});
export type BoardResponse = z.infer<typeof BoardResponse>;
