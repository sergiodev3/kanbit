import {
  type MeetingResponse,
  type MeetingType,
  type SessionUser,
  type TodayMeetingResponse,
  type UpdateMeetingRequest,
  meetingTypeForWeekday,
} from '@kanbit/shared';
import {
  type TeamAccess,
  assertModeratorOrTeacher,
  assertTeamMemberOrTeacher,
  isTeamMember,
} from '../../http/authz';
import { AppError } from '../../http/errors';
import type { Clock, IsoDate } from '../../lib/clock';
import { isUniqueViolation } from '../../lib/prisma';
import { meetingDurationSeconds } from './meeting.rules';

export interface MeetingTeamRecord extends TeamAccess {
  id: string;
  /** The group's IANA time zone (spec §7.1). */
  timezone: string;
}

export interface MeetingRecord {
  id: string;
  sprintId: string;
  /** The team that owns the meeting's sprint (a meeting has no team column). */
  teamId: string;
  type: MeetingType;
  date: IsoDate;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  notesMd: string | null;
  agreements: string | null;
  facilitatorId: string | null;
  updatedAt: Date;
}

export interface NewMeeting {
  sprintId: string;
  type: MeetingType;
  date: IsoDate;
  facilitatorId: string | null;
}

/** Columns a service call may rewrite; `updatedAt` is always set by the service. */
export type MeetingChanges = Partial<
  Pick<MeetingRecord, 'notesMd' | 'agreements' | 'startedAt' | 'endedAt' | 'durationSeconds'>
> & { updatedAt: Date };

/** Persistence port for meetings; the Prisma adapter lives in `meetings.repository.ts`. */
export interface MeetingsRepository {
  transaction<T>(fn: (repository: MeetingsRepository) => Promise<T>): Promise<T>;
  findTeam(teamId: string): Promise<MeetingTeamRecord | null>;
  /** The id of the team's OPEN sprint, or null. */
  findOpenSprintId(teamId: string): Promise<string | null>;
  findMeeting(meetingId: string): Promise<MeetingRecord | null>;
  findMeetingOnDate(sprintId: string, date: IsoDate): Promise<MeetingRecord | null>;
  /** Inserts a meeting with a server-generated id. Throws a unique violation (P2002) for a second one on the day. */
  createMeeting(meeting: NewMeeting): Promise<MeetingRecord>;
  /** Rewrites the meeting only while its `updatedAt` still equals `version`; null when it changed meanwhile. */
  updateMeeting(meetingId: string, version: Date, changes: MeetingChanges): Promise<MeetingRecord | null>;
}

export interface MeetingsService {
  today(actor: SessionUser, teamId: string): Promise<TodayMeetingResponse>;
  create(actor: SessionUser, teamId: string): Promise<MeetingResponse>;
  get(actor: SessionUser, meetingId: string): Promise<MeetingResponse>;
  update(actor: SessionUser, meetingId: string, input: UpdateMeetingRequest): Promise<MeetingResponse>;
  start(actor: SessionUser, meetingId: string): Promise<MeetingResponse>;
  end(actor: SessionUser, meetingId: string): Promise<MeetingResponse>;
}

export interface MeetingsServiceDeps {
  repository: MeetingsRepository;
  clock: Clock;
}

export const meetingNotFound = () => new AppError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
const noOpenSprint = () => new AppError(409, 'NO_OPEN_SPRINT', 'The team has no open sprint');
const noMeetingToday = () => new AppError(409, 'NO_MEETING_TODAY', 'There are no meetings on weekends');
const meetingAlreadyExists = () =>
  new AppError(409, 'MEETING_ALREADY_EXISTS', "Today's meeting of the sprint already exists");
const meetingConflict = () =>
  new AppError(409, 'MEETING_CONFLICT', 'The meeting changed since it was loaded; reload and retry');
const meetingEnded = () => new AppError(409, 'MEETING_ENDED', 'The meeting already ended');
const meetingNotStarted = () => new AppError(409, 'MEETING_NOT_STARTED', 'The meeting has not started');

const toMeetingResponse = (meeting: MeetingRecord): MeetingResponse => ({
  id: meeting.id,
  sprintId: meeting.sprintId,
  teamId: meeting.teamId,
  type: meeting.type,
  date: meeting.date,
  startedAt: meeting.startedAt?.toISOString() ?? null,
  endedAt: meeting.endedAt?.toISOString() ?? null,
  durationSeconds: meeting.durationSeconds,
  notesMd: meeting.notesMd,
  agreements: meeting.agreements,
  facilitatorId: meeting.facilitatorId,
  updatedAt: meeting.updatedAt.toISOString(),
});

/** Optimistic concurrency (spec §5.3.1): a given `expectedUpdatedAt` must match the stored one exactly. */
const isStale = (meeting: MeetingRecord, expectedUpdatedAt: string | undefined): boolean =>
  expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== meeting.updatedAt.getTime();

/** The daily meeting (spec §7.4): the suggested type of the day, notes and agreements, start and end with duration. */
export function createMeetingsService({ repository, clock }: MeetingsServiceDeps): MeetingsService {
  /** Loads a meeting the actor may conduct: hidden (404) from outsiders, 403 for plain members. */
  async function findConductable(tx: MeetingsRepository, actor: SessionUser, meetingId: string) {
    const meeting = await tx.findMeeting(meetingId);
    if (!meeting) throw meetingNotFound();
    assertModeratorOrTeacher(actor, await tx.findTeam(meeting.teamId), meetingNotFound);
    return meeting;
  }

  async function save(tx: MeetingsRepository, meeting: MeetingRecord, changes: MeetingChanges) {
    const updated = await tx.updateMeeting(meeting.id, meeting.updatedAt, changes);
    if (!updated) throw meetingConflict();
    return toMeetingResponse(updated);
  }

  return {
    async today(actor, teamId) {
      const team = await repository.findTeam(teamId);
      assertTeamMemberOrTeacher(actor, team);
      const date = clock.todayInZone(team.timezone);
      const weekday = clock.weekdayInZone(team.timezone);
      const sprintId = await repository.findOpenSprintId(teamId);
      if (!sprintId || !weekday) return { suggestedType: null, date, meeting: null };

      const meeting = await repository.findMeetingOnDate(sprintId, date);
      return {
        suggestedType: meetingTypeForWeekday(weekday),
        date,
        meeting: meeting ? toMeetingResponse(meeting) : null,
      };
    },

    async create(actor, teamId) {
      const team = await repository.findTeam(teamId);
      assertModeratorOrTeacher(actor, team);
      const date = clock.todayInZone(team.timezone);
      const weekday = clock.weekdayInZone(team.timezone);

      try {
        const meeting = await repository.transaction(async (tx) => {
          const sprintId = await tx.findOpenSprintId(teamId);
          if (!sprintId) throw noOpenSprint();
          if (!weekday) throw noMeetingToday();
          if (await tx.findMeetingOnDate(sprintId, date)) throw meetingAlreadyExists();
          return tx.createMeeting({
            sprintId,
            type: meetingTypeForWeekday(weekday),
            date,
            facilitatorId: isTeamMember(actor, team) ? actor.id : null,
          });
        });
        return toMeetingResponse(meeting);
      } catch (err) {
        // A concurrent create won the (sprintId, date) key.
        if (isUniqueViolation(err)) throw meetingAlreadyExists();
        throw err;
      }
    },

    async get(actor, meetingId) {
      const meeting = await repository.findMeeting(meetingId);
      if (!meeting) throw meetingNotFound();
      assertTeamMemberOrTeacher(actor, await repository.findTeam(meeting.teamId), meetingNotFound);
      return toMeetingResponse(meeting);
    },

    async update(actor, meetingId, { expectedUpdatedAt, notesMd, agreements }) {
      return repository.transaction(async (tx) => {
        const meeting = await findConductable(tx, actor, meetingId);
        if (isStale(meeting, expectedUpdatedAt)) throw meetingConflict();
        return save(tx, meeting, {
          ...(notesMd !== undefined && { notesMd }),
          ...(agreements !== undefined && { agreements }),
          updatedAt: clock.now(),
        });
      });
    },

    async start(actor, meetingId) {
      return repository.transaction(async (tx) => {
        const meeting = await findConductable(tx, actor, meetingId);
        if (meeting.endedAt) throw meetingEnded();
        // Idempotent: a replayed start keeps the first start time.
        if (meeting.startedAt) return toMeetingResponse(meeting);
        const now = clock.now();
        return save(tx, meeting, { startedAt: now, updatedAt: now });
      });
    },

    async end(actor, meetingId) {
      return repository.transaction(async (tx) => {
        const meeting = await findConductable(tx, actor, meetingId);
        // Idempotent: a replayed end keeps the first end time and duration.
        if (meeting.endedAt) return toMeetingResponse(meeting);
        if (!meeting.startedAt) throw meetingNotStarted();
        const now = clock.now();
        return save(tx, meeting, {
          endedAt: now,
          durationSeconds: meetingDurationSeconds(meeting.startedAt, now),
          updatedAt: now,
        });
      });
    },
  };
}
