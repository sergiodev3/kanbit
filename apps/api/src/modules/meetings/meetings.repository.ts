import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import type { CheckinRecord, MeetingRecord, MeetingsRepository } from './meetings.service';

const meetingSelect = {
  id: true,
  sprintId: true,
  type: true,
  date: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  notesMd: true,
  agreements: true,
  facilitatorId: true,
  updatedAt: true,
  sprint: { select: { teamId: true } },
} satisfies Prisma.MeetingSelect;

const checkinSelect = {
  id: true,
  meetingId: true,
  userId: true,
  capturedById: true,
  did: true,
  doing: true,
  willDo: true,
  blockers: true,
  present: true,
  updatedAt: true,
} satisfies Prisma.MeetingCheckinSelect;

type MeetingRow = Prisma.MeetingGetPayload<{ select: typeof meetingSelect }>;

/** Postgres `date` columns come back as UTC midnight. */
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);
const fromIsoDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

const toRecord = ({ sprint, date, ...meeting }: MeetingRow): MeetingRecord => ({
  ...meeting,
  date: toIsoDate(date),
  teamId: sprint.teamId,
});

/** Prisma adapter for the meetings service. Inside a transaction `root` is null and calls run on `db`. */
function bind(db: Prisma.TransactionClient, root: PrismaClient | null): MeetingsRepository {
  const repository: MeetingsRepository = {
    transaction: (fn) => (root ? root.$transaction((tx) => fn(bind(tx, null))) : fn(repository)),

    async findTeam(teamId) {
      const team = await db.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          group: { select: { teacherId: true, timezone: true } },
          members: {
            select: { userId: true, isModerator: true, rowOrder: true },
            orderBy: { rowOrder: 'asc' },
          },
        },
      });
      if (!team) return null;
      return { id: team.id, teacherId: team.group.teacherId, timezone: team.group.timezone, members: team.members };
    },

    async findOpenSprintId(teamId) {
      const sprint = await db.sprint.findFirst({ where: { teamId, status: 'OPEN' }, select: { id: true } });
      return sprint?.id ?? null;
    },

    async findMeeting(meetingId) {
      const meeting = await db.meeting.findUnique({ where: { id: meetingId }, select: meetingSelect });
      return meeting ? toRecord(meeting) : null;
    },

    async findMeetingOnDate(sprintId, date) {
      const meeting = await db.meeting.findUnique({
        where: { sprintId_date: { sprintId, date: fromIsoDate(date) } },
        select: meetingSelect,
      });
      return meeting ? toRecord(meeting) : null;
    },

    async createMeeting({ date, ...data }) {
      const meeting = await db.meeting.create({
        data: { ...data, date: fromIsoDate(date) },
        select: meetingSelect,
      });
      return toRecord(meeting);
    },

    async updateMeeting(meetingId, version, changes) {
      const { count } = await db.meeting.updateMany({ where: { id: meetingId, updatedAt: version }, data: changes });
      if (count === 0) return null;
      return repository.findMeeting(meetingId);
    },

    findCheckin: (meetingId, userId) =>
      db.meetingCheckin.findUnique({ where: { meetingId_userId: { meetingId, userId } }, select: checkinSelect }),

    findCheckinById: (checkinId) => db.meetingCheckin.findUnique({ where: { id: checkinId }, select: checkinSelect }),

    listCheckins: (meetingId) => db.meetingCheckin.findMany({ where: { meetingId }, select: checkinSelect }),

    createCheckin: (data) => db.meetingCheckin.create({ data, select: checkinSelect }),

    async updateCheckin(checkinId, version, changes) {
      const { count } = await db.meetingCheckin.updateMany({
        where: { id: checkinId, updatedAt: version },
        data: changes,
      });
      if (count === 0) return null;
      return repository.findCheckinById(checkinId);
    },
  };
  return repository;
}

export function createPrismaMeetingsRepository(prisma: PrismaClient): MeetingsRepository {
  return bind(prisma, prisma);
}
