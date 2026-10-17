import { z } from 'zod';
import { MeetingType, type Weekday } from './enums';
import { cuid2Id } from './ids';

/** Limit for the free text of a meeting (notes and agreements). */
export const MEETING_TEXT_MAX_LENGTH = 10000;

const isoTimestamp = z.iso.datetime();

/** Calendar date `YYYY-MM-DD`. */
const isoDate = z.iso.date();

const WEEKDAY_MEETING_TYPE: Record<Weekday, MeetingType> = {
  MON: 'KICKOFF',
  TUE: 'FOLLOWUP',
  WED: 'FOLLOWUP',
  THU: 'FOLLOWUP',
  FRI: 'CLOSING',
};

/** The meeting suggested for a school day (spec §7.4): Arranque, Seguimiento (Tue-Thu) or Cierre. */
export const meetingTypeForWeekday = (weekday: Weekday): MeetingType => WEEKDAY_MEETING_TYPE[weekday];

/** Free text that may be cleared: blank text and null both mean "none". */
const MeetingText = z
  .string()
  .max(MEETING_TEXT_MAX_LENGTH)
  .nullable()
  .transform((value) => (value?.trim() ? value : null));

/** `PATCH /meetings/:id`: notes and agreements; ended meetings can still be edited. */
export const UpdateMeetingRequest = z
  .object({
    notesMd: MeetingText.optional(),
    agreements: MeetingText.optional(),
    /** Optimistic concurrency (spec §5.3.1): 409 when the meeting changed since this `updatedAt`. */
    expectedUpdatedAt: isoTimestamp.optional(),
  })
  .refine(({ notesMd, agreements }) => notesMd !== undefined || agreements !== undefined, {
    message: 'Provide at least one field to update',
  });
export type UpdateMeetingRequest = z.infer<typeof UpdateMeetingRequest>;

export const MeetingResponse = z.object({
  id: cuid2Id,
  sprintId: cuid2Id,
  teamId: cuid2Id,
  type: MeetingType,
  date: isoDate,
  startedAt: isoTimestamp.nullable(),
  endedAt: isoTimestamp.nullable(),
  /** Whole seconds between start and end; null until the meeting ends. */
  durationSeconds: z.number().int().nonnegative().nullable(),
  notesMd: z.string().nullable(),
  agreements: z.string().nullable(),
  facilitatorId: cuid2Id.nullable(),
  updatedAt: isoTimestamp,
});
export type MeetingResponse = z.infer<typeof MeetingResponse>;

/**
 * `GET /teams/:id/meetings/today`: the suggested type for today in the group's time zone and today's meeting, if
 * created. `suggestedType` is null (and `meeting` null) without an open sprint or on a weekend.
 */
export const TodayMeetingResponse = z.object({
  suggestedType: MeetingType.nullable(),
  date: isoDate,
  meeting: MeetingResponse.nullable(),
});
export type TodayMeetingResponse = z.infer<typeof TodayMeetingResponse>;
