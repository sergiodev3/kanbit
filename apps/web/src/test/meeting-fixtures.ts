import type {
  BoardResponse,
  CheckinResponse,
  MeetingDetailResponse,
  MeetingResponse,
  MeResponse,
  TodayMeetingResponse,
} from '@kanbit/shared';
import { MODERATOR_ID, openSprintBoardFixture, OTHER_ID, STUDENT_ID } from './board-fixtures';
import { jsonResponse, meFixture, mockApi } from './utils';

const STAMP = '2026-10-19T15:00:00.000Z';

export const MEETING_ID = 'm1';

export function meetingFixture(overrides: Partial<MeetingResponse> = {}): MeetingResponse {
  return {
    id: MEETING_ID,
    sprintId: 's1',
    teamId: 't1',
    type: 'KICKOFF',
    date: '2026-10-19',
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    notesMd: null,
    agreements: null,
    facilitatorId: MODERATOR_ID,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function checkinFixture(
  overrides: Partial<CheckinResponse> & Pick<CheckinResponse, 'userId'>,
): CheckinResponse {
  return {
    id: `ck-${overrides.userId}`,
    meetingId: MEETING_ID,
    did: null,
    doing: null,
    willDo: null,
    blockers: null,
    present: true,
    capturedById: null,
    updatedAt: STAMP,
    ...overrides,
  };
}

export function meetingDetailFixture(
  overrides: Partial<MeetingDetailResponse> = {},
): MeetingDetailResponse {
  return { ...meetingFixture(), checkins: [], ...overrides };
}

/** Monday: Arranque is suggested. `meeting` is the day's meeting once it was created. */
export function todayFixture(overrides: Partial<TodayMeetingResponse> = {}): TodayMeetingResponse {
  return { suggestedType: 'KICKOFF', date: '2026-10-19', meeting: null, ...overrides };
}

export type MeetingViewer = 'member' | 'moderator' | 'teacher';

export function meetingMeFixture(viewer: MeetingViewer): MeResponse {
  if (viewer === 'teacher') return meFixture('TEACHER');
  const id = viewer === 'moderator' ? MODERATOR_ID : STUDENT_ID;
  return {
    ...meFixture('STUDENT', { id }),
    memberships: [{ groupId: 'g1', groupName: 'Grupo A', teamId: 't1', teamName: 'Equipo Rojo', isModerator: viewer === 'moderator' }],
  };
}

export interface MeetingApiOptions {
  viewer?: MeetingViewer;
  board?: BoardResponse;
  today?: TodayMeetingResponse;
  detail?: MeetingDetailResponse;
  /** Extra or overriding handlers keyed by `"METHOD /path"`. */
  handlers?: Parameters<typeof mockApi>[0];
}

/**
 * Stubs the endpoints the meeting page reads: session, board (open sprint on Monday Oct 19), today's suggestion
 * and the meeting detail. Writes are mocked per test through `handlers`.
 */
export function mockMeetingApi({ viewer = 'member', board, today, detail, handlers = {} }: MeetingApiOptions = {}) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(200, meetingMeFixture(viewer)),
    'GET /teams/t1/board': () => jsonResponse(200, board ?? openSprintBoardFixture()),
    'GET /teams/t1/meetings/today': () => jsonResponse(200, today ?? todayFixture({ meeting: meetingFixture() })),
    [`GET /meetings/${MEETING_ID}`]: () => jsonResponse(200, detail ?? meetingDetailFixture()),
    ...handlers,
  });
}

export { MODERATOR_ID, OTHER_ID, STUDENT_ID };
