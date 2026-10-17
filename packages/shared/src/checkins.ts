import { z } from 'zod';
import { cuid2Id } from './ids';
import { MeetingResponse } from './meetings';

/** Limit for each text of a check-in (did, doing, willDo, blockers). */
export const CHECKIN_TEXT_MAX_LENGTH = 2000;

const isoTimestamp = z.iso.datetime();

/** Free text that may be cleared: trimmed, and blank text and null both mean "none". */
const CheckinText = z
  .string()
  .trim()
  .max(CHECKIN_TEXT_MAX_LENGTH)
  .nullable()
  .transform((value) => (value ? value : null));

/** The four daily questions (spec §5.3): what I did, what I am doing, what I will do, what blocks me. */
const checkinFields = {
  did: CheckinText.optional(),
  doing: CheckinText.optional(),
  willDo: CheckinText.optional(),
  blockers: CheckinText.optional(),
};

/**
 * `PUT /meetings/:id/checkins/me`: the caller's own check-in, replaced as a whole (an omitted text is cleared).
 * The id is client-generated (spec §5.3.1) so a retry from a queue is idempotent.
 */
export const PutCheckinRequest = z.object({
  id: cuid2Id,
  ...checkinFields,
  present: z.boolean().default(true),
  /** Optimistic concurrency (spec §5.3.1): 409 when the check-in changed since this `updatedAt`. */
  expectedUpdatedAt: isoTimestamp.optional(),
});
export type PutCheckinRequest = z.infer<typeof PutCheckinRequest>;

/** `PATCH /meetings/:id/checkins/:userId`: the moderator captures a teammate's check-in; only what is sent changes. */
export const PatchCheckinRequest = z
  .object({
    ...checkinFields,
    present: z.boolean().optional(),
    expectedUpdatedAt: isoTimestamp.optional(),
  })
  .refine(
    ({ did, doing, willDo, blockers, present }) =>
      [did, doing, willDo, blockers, present].some((value) => value !== undefined),
    { message: 'Provide at least one field to update' },
  );
export type PatchCheckinRequest = z.infer<typeof PatchCheckinRequest>;

export const CheckinResponse = z.object({
  id: cuid2Id,
  meetingId: cuid2Id,
  userId: cuid2Id,
  did: z.string().nullable(),
  doing: z.string().nullable(),
  willDo: z.string().nullable(),
  blockers: z.string().nullable(),
  present: z.boolean(),
  /** The moderator who captured it for the member; null when the member sent it themself. */
  capturedById: cuid2Id.nullable(),
  updatedAt: isoTimestamp,
});
export type CheckinResponse = z.infer<typeof CheckinResponse>;

/** `GET /meetings/:id`: the meeting with its check-ins in team row order. */
export const MeetingDetailResponse = MeetingResponse.extend({
  checkins: z.array(CheckinResponse),
});
export type MeetingDetailResponse = z.infer<typeof MeetingDetailResponse>;
