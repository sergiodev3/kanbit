import {
  type CheckinResponse,
  type MeetingDetailResponse,
  type MeetingResponse,
  type MeetingType,
  type PatchCheckinRequest,
  type PutCheckinRequest,
  type SessionUser,
  type TodayMeetingResponse,
  type UpdateMeetingRequest,
  meetingTypeForWeekday,
} from '@kanbit/shared';
import {
  type TeamAccess,
  assertModeratorOrTeacher,
  assertTeamMemberOrTeacher,
  assertTeamModerator,
  forbidden,
  isTeamMember,
} from '../../http/authz';
import { AppError } from '../../http/errors';
import type { Clock, IsoDate } from '../../lib/clock';
import { isUniqueViolation } from '../../lib/prisma';
import { meetingDurationSeconds } from './meeting.rules';

export interface MeetingTeamRecord extends TeamAccess {
  id: string;
  /** Members in the team's row order (the order of the board). */
  members: readonly { userId: string; isModerator: boolean; rowOrder: number }[];
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

export interface CheckinRecord {
  id: string;
  meetingId: string;
  userId: string;
  /** The moderator who captured it for the member; null for a self-reported check-in. */
  capturedById: string | null;
  did: string | null;
  doing: string | null;
  willDo: string | null;
  blockers: string | null;
  present: boolean;
  updatedAt: Date;
}

/** A check-in to insert; without `id` the store generates a cuid2. */
export type NewCheckin = Omit<CheckinRecord, 'id'> & { id?: string };

/** Columns a service call may rewrite; `updatedAt` is always set by the service. */
export type CheckinChanges = Partial<
  Pick<CheckinRecord, 'did' | 'doing' | 'willDo' | 'blockers' | 'present' | 'capturedById'>
> & { updatedAt: Date };

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
  findCheckin(meetingId: string, userId: string): Promise<CheckinRecord | null>;
  findCheckinById(checkinId: string): Promise<CheckinRecord | null>;
  /** Every check-in of the meeting, in no particular order. */
  listCheckins(meetingId: string): Promise<CheckinRecord[]>;
  /** Inserts a check-in. Throws a unique violation (P2002) for a second one of the user or a taken id. */
  createCheckin(checkin: NewCheckin): Promise<CheckinRecord>;
  /** Rewrites the check-in only while its `updatedAt` still equals `version`; null when it changed meanwhile. */
  updateCheckin(checkinId: string, version: Date, changes: CheckinChanges): Promise<CheckinRecord | null>;
}

/** A saved check-in; `created` tells `201` from `200`. */
export interface CheckinResult {
  checkin: CheckinResponse;
  created: boolean;
}

export interface MeetingsService {
  today(actor: SessionUser, teamId: string): Promise<TodayMeetingResponse>;
  create(actor: SessionUser, teamId: string): Promise<MeetingResponse>;
  get(actor: SessionUser, meetingId: string): Promise<MeetingDetailResponse>;
  update(actor: SessionUser, meetingId: string, input: UpdateMeetingRequest): Promise<MeetingResponse>;
  start(actor: SessionUser, meetingId: string): Promise<MeetingResponse>;
  end(actor: SessionUser, meetingId: string): Promise<MeetingResponse>;
  /** The caller's own check-in: an idempotent upsert on (meeting, user). */
  putMyCheckin(actor: SessionUser, meetingId: string, input: PutCheckinRequest): Promise<CheckinResult>;
  /** The moderator captures a teammate's check-in (plan B); only the sent fields change. */
  captureCheckin(
    actor: SessionUser,
    meetingId: string,
    userId: string,
    input: PatchCheckinRequest,
  ): Promise<CheckinResult>;
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

const checkinConflict = () =>
  new AppError(409, 'CHECKIN_CONFLICT', 'The check-in changed since it was loaded; reload and retry');
const idConflict = () => new AppError(409, 'ID_CONFLICT', 'A check-in with this id already exists');
const notATeamMember = () => new AppError(400, 'NOT_A_TEAM_MEMBER', 'The user is not a member of the meeting team');

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

const toCheckinResponse = (checkin: CheckinRecord): CheckinResponse => ({
  id: checkin.id,
  meetingId: checkin.meetingId,
  userId: checkin.userId,
  did: checkin.did,
  doing: checkin.doing,
  willDo: checkin.willDo,
  blockers: checkin.blockers,
  present: checkin.present,
  capturedById: checkin.capturedById,
  updatedAt: checkin.updatedAt.toISOString(),
});

/** Optimistic concurrency (spec §5.3.1): a given `expectedUpdatedAt` must match the stored one exactly. */
const isStale = (record: { updatedAt: Date }, expectedUpdatedAt: string | undefined): boolean =>
  expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== record.updatedAt.getTime();

type CheckinContent = Pick<CheckinRecord, 'did' | 'doing' | 'willDo' | 'blockers' | 'present' | 'capturedById'>;

const CONTENT_KEYS = ['did', 'doing', 'willDo', 'blockers', 'present', 'capturedById'] as const;

const sameContent = (a: CheckinContent, b: CheckinContent) => CONTENT_KEYS.every((key) => a[key] === b[key]);

/**
 * A concurrent save can win the unique key between our read and our insert (P2002, which also aborts a Postgres
 * transaction). Run the whole save once more so it sees the winner and updates it, or reports the taken id; a
 * second violation is a deterministic conflict.
 */
async function retryOnRace<T>(save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
  try {
    return await save();
  } catch (err) {
    throw isUniqueViolation(err) ? checkinConflict() : err;
  }
}

/** The check-ins in the team's row order; people no longer on the team come last, by user id. */
function sortCheckins(team: MeetingTeamRecord, checkins: CheckinRecord[]): CheckinRecord[] {
  const order = new Map(team.members.map((member) => [member.userId, member.rowOrder]));
  const rank = (checkin: CheckinRecord) => order.get(checkin.userId) ?? Number.POSITIVE_INFINITY;
  return [...checkins].sort((a, b) => {
    const byRow = rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1;
    return byRow || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
  });
}

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

  /** Loads the meeting's team for an actor who may see it; outsiders get 404. */
  async function findMeetingTeam(tx: MeetingsRepository, actor: SessionUser, meetingId: string) {
    const meeting = await tx.findMeeting(meetingId);
    if (!meeting) throw meetingNotFound();
    const team = await tx.findTeam(meeting.teamId);
    assertTeamMemberOrTeacher(actor, team, meetingNotFound);
    return team;
  }

  /**
   * Upserts the check-in of (meeting, user). A given `expectedUpdatedAt` is checked on an existing row; saving
   * the same content again is a no-op that keeps `updatedAt`.
   */
  async function writeCheckin(
    tx: MeetingsRepository,
    write: {
      meetingId: string;
      userId: string;
      /** The id a client generated for a first save (spec §5.3.1); the store generates one when absent. */
      clientId?: string;
      expectedUpdatedAt: string | undefined;
      next(existing: CheckinRecord | null): CheckinContent;
    },
  ): Promise<CheckinResult> {
    const existing = await tx.findCheckin(write.meetingId, write.userId);
    const content = write.next(existing);

    if (existing) {
      if (isStale(existing, write.expectedUpdatedAt)) throw checkinConflict();
      if (sameContent(existing, content)) return { checkin: toCheckinResponse(existing), created: false };
      const updated = await tx.updateCheckin(existing.id, existing.updatedAt, { ...content, updatedAt: clock.now() });
      if (!updated) throw checkinConflict();
      return { checkin: toCheckinResponse(updated), created: false };
    }

    if (write.clientId && (await tx.findCheckinById(write.clientId))) throw idConflict();
    const created = await tx.createCheckin({
      ...(write.clientId && { id: write.clientId }),
      meetingId: write.meetingId,
      userId: write.userId,
      ...content,
      updatedAt: clock.now(),
    });
    return { checkin: toCheckinResponse(created), created: true };
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
      const team = await repository.findTeam(meeting.teamId);
      assertTeamMemberOrTeacher(actor, team, meetingNotFound);
      const checkins = sortCheckins(team, await repository.listCheckins(meeting.id));
      return { ...toMeetingResponse(meeting), checkins: checkins.map(toCheckinResponse) };
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

    putMyCheckin(actor, meetingId, input) {
      return retryOnRace(() =>
        repository.transaction(async (tx) => {
          const team = await findMeetingTeam(tx, actor, meetingId);
          // The teacher only reads check-ins.
          if (!isTeamMember(actor, team)) throw forbidden();
          return writeCheckin(tx, {
            meetingId,
            userId: actor.id,
            clientId: input.id,
            expectedUpdatedAt: input.expectedUpdatedAt,
            // A PUT replaces the whole check-in; a self-reported one has no capturer.
            next: () => ({
              did: input.did ?? null,
              doing: input.doing ?? null,
              willDo: input.willDo ?? null,
              blockers: input.blockers ?? null,
              present: input.present,
              capturedById: null,
            }),
          });
        }),
      );
    },

    captureCheckin(actor, meetingId, userId, input) {
      return retryOnRace(() =>
        repository.transaction(async (tx) => {
          const team = await findMeetingTeam(tx, actor, meetingId);
          assertTeamModerator(actor, team, meetingNotFound);
          if (!team.members.some((member) => member.userId === userId)) throw notATeamMember();
          const { did, doing, willDo, blockers, present } = input;
          return writeCheckin(tx, {
            meetingId,
            userId,
            expectedUpdatedAt: input.expectedUpdatedAt,
            // A PATCH changes only what it carries; a moderator's own check-in has no capturer.
            next: (existing) => ({
              did: did === undefined ? (existing?.did ?? null) : did,
              doing: doing === undefined ? (existing?.doing ?? null) : doing,
              willDo: willDo === undefined ? (existing?.willDo ?? null) : willDo,
              blockers: blockers === undefined ? (existing?.blockers ?? null) : blockers,
              present: present ?? existing?.present ?? true,
              capturedById: userId === actor.id ? null : actor.id,
            }),
          });
        }),
      );
    },
  };
}
