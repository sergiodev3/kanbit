import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

const WED = new Date('2026-10-21T16:00:00Z');
const LATER = new Date('2026-10-21T16:05:00Z');

const ID_A = 'ca4a98xxat96iws9zmbrgj3a';
const ID_B = 'cb4a98xxat96iws9zmbrgj3b';
const ID_C = 'cc4a98xxat96iws9zmbrgj3c';

async function setup() {
  const ctx = buildTestApp({ now: WED });
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
  const member2 = student('a0003');
  const outsider = student('a0004');
  db.addTeamMember({ teamId: team.id, userId: moderator.id, isModerator: true });
  db.addTeamMember({ teamId: team.id, userId: member.id });
  db.addTeamMember({ teamId: team.id, userId: member2.id });
  db.addTeamMember({ teamId: otherTeam.id, userId: outsider.id, isModerator: true });
  const sprint = db.addSprint({ teamId: team.id });
  const meeting = db.addMeeting({ sprintId: sprint.id, date: '2026-10-21' });

  const call = async (method: 'get' | 'put' | 'patch', path: string, user: { id: string }, body?: object) => {
    const req = request(ctx.app)[method](`/api/v1${path}`).set('Cookie', await ctx.cookieFor(user.id));
    return body ? req.send(body) : req;
  };
  const put = (user: { id: string }, body: object, meetingId = meeting.id) =>
    call('put', `/meetings/${meetingId}/checkins/me`, user, body);
  const capture = (user: { id: string }, userId: string, body: object, meetingId = meeting.id) =>
    call('patch', `/meetings/${meetingId}/checkins/${userId}`, user, body);
  const get = (user: { id: string }, meetingId = meeting.id) => call('get', `/meetings/${meetingId}`, user);
  const today = (user: { id: string }) => call('get', `/teams/${team.id}/meetings/today`, user);

  return {
    ...ctx,
    teacher,
    otherTeacher,
    team,
    otherTeam,
    moderator,
    member,
    member2,
    outsider,
    sprint,
    meeting,
    put,
    capture,
    get,
    today,
  };
}

describe('PUT /meetings/:id/checkins/me', () => {
  it('creates the first check-in with the client id (201) and leaves capturedById empty', async () => {
    const { db, meeting, member, put } = await setup();

    const res = await put(member, { id: ID_A, did: 'Login', doing: 'Tests', willDo: 'Deploy', blockers: 'Nada' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: ID_A,
      meetingId: meeting.id,
      userId: member.id,
      did: 'Login',
      doing: 'Tests',
      willDo: 'Deploy',
      blockers: 'Nada',
      present: true,
      capturedById: null,
      updatedAt: WED.toISOString(),
    });
    expect(db.checkins).toHaveLength(1);
  });

  it('lets the moderator send their own check-in', async () => {
    const { moderator, put } = await setup();

    const res = await put(moderator, { id: ID_A, did: 'Revise el tablero' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: moderator.id, capturedById: null });
  });

  it('updates the existing check-in (200) and keeps its original id, replacing the whole content', async () => {
    const { db, time, member, put } = await setup();
    await put(member, { id: ID_A, did: 'Login', blockers: 'Wifi' });

    time.now = LATER;
    const res = await put(member, { id: ID_B, doing: 'Tests', present: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ID_A,
      did: null,
      doing: 'Tests',
      blockers: null,
      present: false,
      updatedAt: LATER.toISOString(),
    });
    expect(db.checkins).toHaveLength(1);
  });

  it('treats a repeated identical PUT as a no-op (200, no updatedAt bump)', async () => {
    const { time, member, put } = await setup();
    const body = { id: ID_A, did: 'Login', doing: '  ', willDo: 'Deploy' };
    const first = await put(member, body);

    time.now = LATER;
    const again = await put(member, body);

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(again.body.updatedAt).toBe(WED.toISOString());
  });

  it('trims the text and stores blank text as null', async () => {
    const { db, member, put } = await setup();

    const res = await put(member, { id: ID_A, did: '  Login  ', doing: '   ', willDo: '', blockers: null });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ did: 'Login', doing: null, willDo: null, blockers: null });
    expect(db.checkins[0]).toMatchObject({ did: 'Login', doing: null });
  });

  it('can be saved before the meeting starts and after it ended', async () => {
    const { db, meeting, member, member2, put } = await setup();
    expect(meeting.startedAt).toBeNull();
    expect((await put(member, { id: ID_A, did: 'Antes' })).status).toBe(201);

    meeting.startedAt = new Date('2026-10-21T16:00:00Z');
    meeting.endedAt = new Date('2026-10-21T16:10:00Z');
    meeting.durationSeconds = 600;
    expect((await put(member2, { id: ID_B, did: 'Despues' })).status).toBe(201);
    expect((await put(member, { id: ID_A, did: 'Corregido' })).status).toBe(200);
    expect(db.checkins.map((row) => row.did)).toEqual(['Corregido', 'Despues']);
  });

  it('replaces a captured check-in with the member own version (capturedById back to null)', async () => {
    const { db, meeting, member, moderator, put } = await setup();
    db.addCheckin({ id: ID_A, meetingId: meeting.id, userId: member.id, capturedById: moderator.id, did: 'x' });

    const res = await put(member, { id: ID_B, did: 'x' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ID_A, capturedById: null });
  });

  it('answers 409 ID_CONFLICT when the client id belongs to another check-in, and writes nothing', async () => {
    const { db, meeting, member, member2, put } = await setup();
    await put(member2, { id: ID_A, did: 'Mio' });

    const sameMeeting = await put(member, { id: ID_A, did: 'Robo' });
    expect(sameMeeting.status).toBe(409);
    expect(sameMeeting.body.error.code).toBe('ID_CONFLICT');

    const other = db.addMeeting({ sprintId: meeting.sprintId, date: '2026-10-20' });
    const otherMeeting = await put(member, { id: ID_A, did: 'Robo' }, other.id);
    expect(otherMeeting.status).toBe(409);
    expect(otherMeeting.body.error.code).toBe('ID_CONFLICT');
    expect(db.checkins).toHaveLength(1);
  });

  it('answers 409 CHECKIN_CONFLICT when expectedUpdatedAt is stale, and applies it when it matches', async () => {
    const { db, time, member, put } = await setup();
    const first = await put(member, { id: ID_A, did: 'v1' });
    time.now = LATER;
    await put(member, { id: ID_A, did: 'v2' });

    const stale = await put(member, { id: ID_A, did: 'v3', expectedUpdatedAt: first.body.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CHECKIN_CONFLICT');
    expect(db.checkins[0]?.did).toBe('v2');

    const fresh = await put(member, { id: ID_A, did: 'v3', expectedUpdatedAt: LATER.toISOString() });
    expect(fresh.status).toBe(200);
    expect(fresh.body.did).toBe('v3');
  });

  it('ignores expectedUpdatedAt on the first save', async () => {
    const { member, put } = await setup();

    const res = await put(member, { id: ID_A, did: 'x', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' });

    expect(res.status).toBe(201);
  });

  it('forbids the teacher (403) and hides the meeting from outsiders (404)', async () => {
    const { db, teacher, otherTeacher, outsider, put } = await setup();

    expect((await put(teacher, { id: ID_A, did: 'x' })).status).toBe(403);
    for (const user of [outsider, otherTeacher]) {
      const res = await put(user, { id: ID_A, did: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
    }
    expect(db.checkins).toHaveLength(0);
  });

  it('answers 404 for an unknown meeting', async () => {
    const { member, put } = await setup();

    const res = await put(member, { id: ID_A, did: 'x' }, 'zz9unknownmeeting');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
  });

  it('rejects an invalid body (400 VALIDATION_ERROR)', async () => {
    const { db, member, put } = await setup();

    for (const body of [{}, { id: 'NOT A CUID' }, { id: ID_A, did: 'a'.repeat(2001) }, { id: ID_A, present: 'si' }]) {
      const res = await put(member, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(db.checkins).toHaveLength(0);
  });

  it('turns a concurrent first save of the same member into an update (200), never a 500', async () => {
    const { db, meeting, member, put } = await setup();
    db.raceNextCheckinCreate = () => {
      db.addCheckin({ id: ID_C, meetingId: meeting.id, userId: member.id, did: 'Otro dispositivo' });
    };

    const res = await put(member, { id: ID_A, did: 'Este dispositivo' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ID_C, did: 'Este dispositivo' });
    expect(db.checkins).toHaveLength(1);
  });

  it('turns a concurrent insert of the same id by someone else into 409 ID_CONFLICT', async () => {
    const { db, meeting, member, member2, put } = await setup();
    db.raceNextCheckinCreate = () => {
      db.addCheckin({ id: ID_A, meetingId: meeting.id, userId: member2.id });
    };

    const res = await put(member, { id: ID_A, did: 'x' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ID_CONFLICT');
  });
});

describe('PATCH /meetings/:id/checkins/:userId', () => {
  it('lets the moderator capture a teammate check-in (201, server id, capturedById = moderator)', async () => {
    const { db, meeting, moderator, member, capture } = await setup();

    const res = await capture(moderator, member.id, { did: ' Login ', present: true });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      meetingId: meeting.id,
      userId: member.id,
      did: 'Login',
      doing: null,
      present: true,
      capturedById: moderator.id,
      updatedAt: WED.toISOString(),
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(db.checkins).toHaveLength(1);
  });

  it('updates only the sent fields (200), keeping id and the rest', async () => {
    const { time, moderator, member, capture } = await setup();
    const created = await capture(moderator, member.id, { did: 'Login', blockers: 'Wifi' });

    time.now = LATER;
    const res = await capture(moderator, member.id, { doing: 'Tests', blockers: '' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      did: 'Login',
      doing: 'Tests',
      blockers: null,
      capturedById: moderator.id,
      updatedAt: LATER.toISOString(),
    });
  });

  it('marks an absent member without text', async () => {
    const { moderator, member, capture } = await setup();

    const res = await capture(moderator, member.id, { present: false });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ present: false, did: null, capturedById: moderator.id });
  });

  it('records no capturer when the moderator fills their own check-in', async () => {
    const { moderator, capture } = await setup();

    const res = await capture(moderator, moderator.id, { did: 'Yo' });

    expect(res.status).toBe(201);
    expect(res.body.capturedById).toBeNull();
  });

  it('is a no-op (200, no updatedAt bump) when nothing changes', async () => {
    const { time, moderator, member, capture } = await setup();
    const first = await capture(moderator, member.id, { did: 'Login' });

    time.now = LATER;
    const again = await capture(moderator, member.id, { did: 'Login' });

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
  });

  it('works before the meeting starts and after it ended', async () => {
    const { meeting, moderator, member, member2, capture } = await setup();
    expect((await capture(moderator, member.id, { did: 'Antes' })).status).toBe(201);

    meeting.startedAt = new Date('2026-10-21T16:00:00Z');
    meeting.endedAt = new Date('2026-10-21T16:10:00Z');
    meeting.durationSeconds = 600;
    expect((await capture(moderator, member2.id, { did: 'Despues' })).status).toBe(201);
  });

  it('answers 409 CHECKIN_CONFLICT when expectedUpdatedAt is stale', async () => {
    const { db, time, moderator, member, capture } = await setup();
    const first = await capture(moderator, member.id, { did: 'v1' });
    time.now = LATER;
    await capture(moderator, member.id, { did: 'v2' });

    const stale = await capture(moderator, member.id, { did: 'v3', expectedUpdatedAt: first.body.updatedAt });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CHECKIN_CONFLICT');
    expect(db.checkins[0]?.did).toBe('v2');
  });

  it('forbids members and the teacher (403) and hides the meeting from outsiders (404)', async () => {
    const { db, teacher, otherTeacher, member, outsider, member2, capture } = await setup();

    for (const user of [member, member2, teacher]) {
      expect((await capture(user, member.id, { did: 'x' })).status).toBe(403);
    }
    for (const user of [outsider, otherTeacher]) {
      const res = await capture(user, member.id, { did: 'x' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEETING_NOT_FOUND');
    }
    expect((await capture(member, member.id, { did: 'x' }, 'zz9unknownmeeting')).status).toBe(404);
    expect(db.checkins).toHaveLength(0);
  });

  it('rejects a target outside the team (400 NOT_A_TEAM_MEMBER), after the 404 and 403 checks', async () => {
    const { db, moderator, member, outsider, capture } = await setup();

    for (const userId of [outsider.id, 'zz9unknownuser']) {
      const res = await capture(moderator, userId, { did: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_A_TEAM_MEMBER');
    }
    expect((await capture(member, outsider.id, { did: 'x' })).status).toBe(403);
    expect((await capture(outsider, member.id, { did: 'x' })).status).toBe(404);
    expect(db.checkins).toHaveLength(0);
  });

  it('rejects an empty or invalid body (400 VALIDATION_ERROR)', async () => {
    const { moderator, member, capture } = await setup();

    for (const body of [{}, { expectedUpdatedAt: WED.toISOString() }, { did: 'a'.repeat(2001) }, { present: 'si' }]) {
      const res = await capture(moderator, member.id, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('turns a concurrent first capture into an update (200), never a 500', async () => {
    const { db, meeting, moderator, member, capture } = await setup();
    db.raceNextCheckinCreate = () => {
      db.addCheckin({ id: ID_C, meetingId: meeting.id, userId: member.id, did: 'Desde el celular' });
    };

    const res = await capture(moderator, member.id, { doing: 'Tests' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ID_C, did: 'Desde el celular', doing: 'Tests', capturedById: moderator.id });
    expect(db.checkins).toHaveLength(1);
  });
});

describe('GET /meetings/:id with check-ins', () => {
  it('lists the check-ins by team row order, then by user id, for members and the teacher', async () => {
    const { db, meeting, teacher, moderator, member, member2, get } = await setup();
    const gone = db.addUser({ username: 'a0009', role: 'STUDENT', passwordHash: 'x' });
    for (const userId of [gone.id, member2.id, moderator.id, member.id]) {
      db.addCheckin({ meetingId: meeting.id, userId, did: userId });
    }

    for (const user of [teacher, member]) {
      const res = await get(user);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(meeting.id);
      expect(res.body.checkins.map((c: { userId: string }) => c.userId)).toEqual([
        moderator.id,
        member.id,
        member2.id,
        gone.id,
      ]);
    }
  });

  it('keeps the meeting fields and answers an empty list without check-ins', async () => {
    const { moderator, meeting, get } = await setup();

    const res = await get(moderator);

    expect(res.body).toMatchObject({ id: meeting.id, type: 'FOLLOWUP', date: '2026-10-21', checkins: [] });
  });

  it('never leaks check-ins of other meetings or teams', async () => {
    const { db, sprint, meeting, otherTeam, outsider, member, get } = await setup();
    const yesterday = db.addMeeting({ sprintId: sprint.id, date: '2026-10-20' });
    db.addCheckin({ meetingId: yesterday.id, userId: member.id, did: 'Ayer' });
    const otherSprint = db.addSprint({ teamId: otherTeam.id });
    const otherMeeting = db.addMeeting({ sprintId: otherSprint.id, date: '2026-10-21' });
    db.addCheckin({ meetingId: otherMeeting.id, userId: outsider.id, did: 'Secreto' });

    const mine = await get(member);
    expect(mine.body.checkins).toEqual([]);
    expect(JSON.stringify(mine.body)).not.toContain('Secreto');
    expect((await get(member, otherMeeting.id)).status).toBe(404);
    expect((await get(outsider, meeting.id)).status).toBe(404);
  });

  it('keeps the today endpoint returning the plain meeting', async () => {
    const { member, meeting, put, today } = await setup();
    await put(member, { id: ID_A, did: 'x' });

    const res = await today(member);

    expect(res.body.meeting).toMatchObject({ id: meeting.id });
    expect(res.body.meeting).not.toHaveProperty('checkins');
  });
});
