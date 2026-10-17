import { z } from 'zod';
import { BoardSprint } from './cards';
import { cuid2Id } from './ids';

/** The weekly sprint (spec §2.3, §7.2). */
export const SPRINT_GOAL_MAX_LENGTH = 200;

export const SprintGoal = z.string().trim().min(1).max(SPRINT_GOAL_MAX_LENGTH);

/** `POST /teams/:id/sprints`: the server picks the id, number and Monday–Friday dates. */
export const StartSprintRequest = z.object({ goal: SprintGoal });
export type StartSprintRequest = z.infer<typeof StartSprintRequest>;

export const SprintResponse = BoardSprint.extend({ teamId: cuid2Id });
export type SprintResponse = z.infer<typeof SprintResponse>;

/** `POST /sprints/:id/close`: the closed sprint and the unfinished cards sent back to the Backlog. */
export const CloseSprintResponse = z.object({
  sprint: SprintResponse,
  returnedCardIds: z.array(cuid2Id),
});
export type CloseSprintResponse = z.infer<typeof CloseSprintResponse>;

/** `POST /teams/:id/cards/validate-all`: the cards the moderator just validated, in board order. */
export const ValidateAllResponse = z.object({ validatedIds: z.array(cuid2Id) });
export type ValidateAllResponse = z.infer<typeof ValidateAllResponse>;
