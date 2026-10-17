import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

/** 10:00 in Monterrey (UTC-6) on each school day of the week of Mon 19 Oct 2026. */
const DAYS = {
  MON: new Date('2026-10-19T16:00:00Z'),
  TUE: new Date('2026-10-20T16:00:00Z'),
  WED: new Date('2026-10-21T16:00:00Z'),
  THU: new Date('2026-10-22T16:00:00Z'),
  FRI: new Date('2026-10-23T16:00:00Z'),
  SAT: new Date('2026-10-24T16:00:00Z'),
};

async function setup(now = DAYS.WED, { openSprint = true } = {}) {
  const ctx = buildTestApp({ now });
  const { db } = ctx;
  const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
  const otherTeacher = db.addUser({ username: 'maestro', role: 'TEACHER', passwordHash: 'x' });
  const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });
  const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
  const otherTeam = db.addTeam({ name: 'Bytes', groupId: group.id });
  const student = (username: string) => {
    const user = db.addUser({ username, role: 'STUDENT', passwordHash: 'x' });
    db.addGroupMember(group.id, user.id);
    return user;
  };
  const moderator = student('a0001');
  const member = student('a0002');
  const outsider = student('a0003');
  db.addTeamMember({ teamId: team.id, userId: moderator.id, isModerator: true });
  db.addTeamMember({ teamId: team.id, userId: member.id });
  db.addTeamMember({ teamId: otherTeam.id, userId: outsider.id, isModerator: true });
  const sprint = openSprint ? db.addSprint({ teamId: team.id }) : null;

  const call = async (method: 'get' | 'post' | 'patch', path: string, user: { id: string }, body?: object) => {
    const req = request(ctx.app)[method](`/api/v1${path}`).set('Cookie', await ctx.cookieFor(user.id));
    return body ? req.send(body) : req;
  };
  const today = (user: { id: string }, teamId = team.id) => call('get', `/teams/${teamId}/meetings/today`, user);
  const create = (user: { id: string }, teamId = team.id) => call('post', `/teams/${teamId}/meetings`, user);
  const get = (user: { id: string }, id: string) => call('get', `/meetings/${id}`, user);
  const patch = (user: { id: string }, id: string, body: object) => call('patch', `/meetings/${id}`, user, body);
  const start = (user: { id: string }, id: string) => call('post', `/meetings/${id}/start`, user);
  const end = (user: { id: string }, id: string) => call('post', `/meetings/${id}/end`, user);

  return {
    ...ctx,
    teacher,
    otherTeacher,
    group,
    team,
    otherTeam,
    moderator,
    member,
    outsider,
    sprint,
    today,
    create,
    get,
    patch,
    start,
    end,
  };
}

describe('GET /teams/:id/meetings/today', () => {
  it.each([
    ['MON', '2026-10-19', 'KICKOFF'],
    ['TUE', '2026-10-20', 'FOLLOWUP'],
    ['WED', '2026-10-21', 'FOLLOWUP'],
    ['THU', '2026-10-22', 'FOLLOWUP'],
    ['FRI', '2026-10-23', 'CLOSING'],
  ] as const)('suggests the %s meeting type with no meeting yet', async (day, date, type) => {
    const { moderator, today } = await setup(DAYS[day]);

    const res = await today(moderator);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestedType: type, date, meeting: null });
  });

  it('answers with nothing to suggest on a weekend, even with an open sprint', async () => {
    const { moderator, today } = await setup(DAYS.SAT);

    const res = await today(moderator);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestedType: null, date: '2026-10-24', meeting: null });
  });

  it('answers with nothing to suggest without an open sprint', async () => {
    const { db, team, moderator, today } = await setup(DAYS.WED, { openSprint: false });
    db.addSprint({ teamId: team.id, status: 'CLOSED' });

    const res = await today(moderator);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestedType: null, date: '2026-10-21', meeting: null });
  });

  it("includes today's meeting once created, and not a meeting of another day", async () => {
    const { db, sprint, moderator, member, today } = await setup();
    db.addMeeting({ sprintId: sprint!.id, date: '2026-10-20' });
    expect((await today(member)).body.meeting).toBeNull();

    const created = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21', notesMd: 'Notas' });

    const res = await today(moderator);
    expect(res.body.meeting).toMatchObject({ id: created.id, date: '2026-10-21', notesMd: 'Notas' });
  });

  it("decides the day in the group's time zone", async () => {
    // Saturday 02:00Z: still Friday in Monterrey, already Saturday in UTC.
    const fridayNight = new Date('2026-10-24T02:00:00Z');
    const monterrey = await setup(fridayNight);
    const utc = await setup(fridayNight);
    utc.db.setGroupTimezone(utc.group.id, 'UTC');

    expect((await monterrey.today(monterrey.moderator)).body).toMatchObject({
      suggestedType: 'CLOSING',
      date: '2026-10-23',
    });
    expect((await utc.today(utc.moderator)).body).toMatchObject({ suggestedType: null, date: '2026-10-24' });
  });

  it('is readable by members and the group teacher; outsiders and other teachers get 404', async () => {
    const { teacher, otherTeacher, member, outsider, today } = await setup();

    expect((await today(member)).status).toBe(200);
    expect((await today(teacher)).status).toBe(200);
    for (const user of [outsider, otherTeacher]) {
      const res = await today(user);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
    }
  });

  it('requires a session and a valid team id', async () => {
    const { app, moderator, today, team } = await setup();

    expect((await request(app).get(`/api/v1/teams/${team.id}/meetings/today`)).status).toBe(401);
    expect((await today(moderator, 'NOT-AN-ID')).status).toBe(400);
    expect((await today(moderator, 'zz9unknownteam')).status).toBe(404);
  });
});

describe('POST /teams/:id/meetings', () => {
  it.each([
    ['MON', 'KICKOFF'],
    ['TUE', 'FOLLOWUP'],
    ['WED', 'FOLLOWUP'],
    ['THU', 'FOLLOWUP'],
    ['FRI', 'CLOSING'],
  ] as const)('creates the %s meeting of the suggested type (201)', async (day, type) => {
    const { team, sprint, moderator, create, today } = await setup(DAYS[day]);

    const res = await create(moderator);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      sprintId: sprint!.id,
      teamId: team.id,
      type,
      date: (await today(moderator)).body.date,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      notesMd: null,
      agreements: null,
      facilitatorId: moderator.id,
      updatedAt: DAYS[day].toISOString(),
    });
    expect((await today(moderator)).body.meeting.id).toBe(res.body.id);
  });

  it('lets the group teacher open it, with no facilitator', async () => {
    const { teacher, create } = await setup();

    const res = await create(teacher);

    expect(res.status).toBe(201);
    expect(res.body.facilitatorId).toBeNull();
  });

  it('refuses plain members (403), and hides the team from outsiders and other teachers (404)', async () => {
    const { db, member, outsider, otherTeacher, create } = await setup();

    expect((await create(member)).status).toBe(403);
    for (const user of [outsider, otherTeacher]) {
      const res = await create(user);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
    }
    expect(db.meetings).toHaveLength(0);
  });

  it('needs an open sprint (409 NO_OPEN_SPRINT)', async () => {
    const { db, moderator, create } = await setup(DAYS.WED, { openSprint: false });

    const res = await create(moderator);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_OPEN_SPRINT');
    expect(db.meetings).toHaveLength(0);
  });

  it('has no meeting on weekends (409 NO_MEETING_TODAY)', async () => {
    const { db, moderator, create } = await setup(DAYS.SAT);

    const res = await create(moderator);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_MEETING_TODAY');
    expect(db.meetings).toHaveLength(0);
  });

  it('refuses a second meeting the same day (409 MEETING_ALREADY_EXISTS), also when a concurrent create wins', async () => {
    const { db, sprint, moderator, teacher, create } = await setup();
    expect((await create(moderator)).status).toBe(201);

    const again = await create(teacher);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('MEETING_ALREADY_EXISTS');

    db.meetings.splice(0);
    db.raceNextMeetingCreate = () => db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });
    const raced = await create(moderator);
    expect(raced.status).toBe(409);
    expect(raced.body.error.code).toBe('MEETING_ALREADY_EXISTS');
    expect(db.meetings).toHaveLength(1);
  });

  it('allows a meeting the next day of the same sprint', async () => {
    const { time, moderator, create } = await setup();
    expect((await create(moderator)).status).toBe(201);

    time.now = DAYS.THU;

    const next = await create(moderator);
    expect(next.status).toBe(201);
    expect(next.body.date).toBe('2026-10-22');
  });
});

describe('GET /meetings/:id', () => {
  it('shows the meeting to team members and the group teacher', async () => {
    const { db, team, sprint, teacher, moderator, member, get } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21', agreements: 'Probar' });

    for (const user of [teacher, moderator, member]) {
      const res = await get(user, meeting.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: meeting.id, teamId: team.id, agreements: 'Probar' });
    }
  });

  it("never leaks another team's meeting: outsiders and other teachers get 404 MEETING_NOT_FOUND", async () => {
    const { db, sprint, outsider, otherTeacher, get } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    for (const user of [outsider, otherTeacher]) {
      const res = await get(user, meeting.id);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
    }
    expect((await get(outsider, 'zz9unknownmeeting')).body.error.code).toBe('MEETING_NOT_FOUND');
  });
});

describe('PATCH /meetings/:id', () => {
  it('saves notes and agreements for the moderator and the teacher, clearing blank text', async () => {
    const { db, sprint, teacher, moderator, patch } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    const first = await patch(moderator, meeting.id, { notesMd: '# Notas\n- uno', agreements: 'Terminar login' });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ notesMd: '# Notas\n- uno', agreements: 'Terminar login' });

    const second = await patch(teacher, meeting.id, { agreements: '  ' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ notesMd: '# Notas\n- uno', agreements: null });
  });

  it('still edits notes after the meeting ended', async () => {
    const { db, sprint, moderator, patch } = await setup();
    const meeting = db.addMeeting({
      sprintId: sprint!.id,
      date: '2026-10-21',
      startedAt: new Date('2026-10-21T15:00:00Z'),
      endedAt: new Date('2026-10-21T15:10:00Z'),
      durationSeconds: 600,
    });

    const res = await patch(moderator, meeting.id, { notesMd: 'Tarde' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notesMd: 'Tarde', durationSeconds: 600 });
  });

  it('checks 404 before 403: members get 403, outsiders and other teachers 404', async () => {
    const { db, sprint, member, outsider, otherTeacher, patch } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    expect((await patch(member, meeting.id, { notesMd: 'x' })).status).toBe(403);
    for (const user of [outsider, otherTeacher]) {
      const res = await patch(user, meeting.id, { notesMd: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
    }
    expect(db.meetings[0]?.notesMd).toBeNull();
  });

  it('answers 409 MEETING_CONFLICT when expectedUpdatedAt is stale, and saves when it matches', async () => {
    const { db, time, sprint, moderator, patch } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });
    const loaded = meeting.updatedAt.toISOString();

    time.now = new Date('2026-10-21T16:05:00Z');
    const fresh = await patch(moderator, meeting.id, { notesMd: 'Uno', expectedUpdatedAt: loaded });
    expect(fresh.status).toBe(200);
    expect(fresh.body.updatedAt).toBe(time.now.toISOString());

    const stale = await patch(moderator, meeting.id, { notesMd: 'Dos', expectedUpdatedAt: loaded });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('MEETING_CONFLICT');
    expect(db.meetings[0]?.notesMd).toBe('Uno');
  });

  it('rejects an empty or oversized body (400 VALIDATION_ERROR)', async () => {
    const { db, sprint, moderator, patch } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    for (const body of [{}, { notesMd: 'a'.repeat(10001) }, { notesMd: 5 }]) {
      const res = await patch(moderator, meeting.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /meetings/:id/start and /end', () => {
  it('starts at the clock time, and a repeated start keeps the first time (200)', async () => {
    const { db, time, sprint, moderator, start } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    const first = await start(moderator, meeting.id);
    expect(first.status).toBe(200);
    expect(first.body.startedAt).toBe(DAYS.WED.toISOString());

    time.now = new Date('2026-10-21T16:03:00Z');
    const again = await start(moderator, meeting.id);
    expect(again.status).toBe(200);
    expect(again.body.startedAt).toBe(DAYS.WED.toISOString());
    expect(again.body.updatedAt).toBe(first.body.updatedAt);
  });

  it('ends with the whole-second duration saved, and a repeated end changes nothing (200)', async () => {
    const { db, time, sprint, teacher, moderator, start, end, get } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });
    await start(moderator, meeting.id);

    time.now = new Date('2026-10-21T16:14:30.900Z');
    const first = await end(teacher, meeting.id);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      startedAt: DAYS.WED.toISOString(),
      endedAt: '2026-10-21T16:14:30.900Z',
      durationSeconds: 870,
    });

    time.now = new Date('2026-10-21T17:00:00Z');
    const again = await end(moderator, meeting.id);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect((await get(moderator, meeting.id)).body.durationSeconds).toBe(870);
  });

  it('cannot end before starting (409 MEETING_NOT_STARTED) nor start after ending (409 MEETING_ENDED)', async () => {
    const { db, sprint, moderator, start, end } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    const early = await end(moderator, meeting.id);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('MEETING_NOT_STARTED');
    expect(db.meetings[0]?.endedAt).toBeNull();

    await start(moderator, meeting.id);
    await end(moderator, meeting.id);
    const late = await start(moderator, meeting.id);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('MEETING_ENDED');
  });

  it('checks 404 before 403 before state errors', async () => {
    const { db, sprint, member, outsider, otherTeacher, start, end } = await setup();
    const meeting = db.addMeeting({ sprintId: sprint!.id, date: '2026-10-21' });

    for (const act of [start, end]) {
      expect((await act(member, meeting.id)).status).toBe(403);
      for (const user of [outsider, otherTeacher]) {
        const res = await act(user, meeting.id);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
      }
      expect((await act(member, 'zz9unknownmeeting')).status).toBe(404);
    }
    expect(db.meetings[0]?.startedAt).toBeNull();
  });
});
