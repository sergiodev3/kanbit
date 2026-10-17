import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

/** Monday 19 Oct 2026, 09:00 in Monterrey. */
const MONDAY = new Date('2026-10-19T15:00:00Z');
const LATER = new Date('2026-10-19T16:30:00Z');

async function setup() {
  const ctx = buildTestApp({ now: MONDAY });
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
  const sprint = db.addSprint({ teamId: team.id });

  /** A planned card of the open sprint in `member`'s Por hacer, not yet validated. */
  const todoCard = (data: { id?: string; position?: string; assigneeId?: string } = {}) =>
    db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'TODO',
      doneCriteria: 'Demo',
      dueWeekday: 'TUE',
      sprintId: sprint.id,
      ...data,
    });

  const api = (path: string) => `/api/v1${path}`;
  const validate = async (user: { id: string }, cardId: string, body?: object) => {
    const req = request(ctx.app)
      .post(api(`/cards/${cardId}/validate`))
      .set('Cookie', await ctx.cookieFor(user.id));
    return body === undefined ? req.send() : req.send(body);
  };
  const validateAll = async (user: { id: string }, teamId = team.id) =>
    request(ctx.app)
      .post(api(`/teams/${teamId}/cards/validate-all`))
      .set('Cookie', await ctx.cookieFor(user.id))
      .send();
  const stored = (id: string) => db.cards.find((row) => row.id === id);
  const events = () => db.cardEvents.map(({ cardId, userId, type, fromStatus, toStatus }) => ({
    cardId,
    userId,
    type,
    fromStatus,
    toStatus,
  }));

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
    todoCard,
    validate,
    validateAll,
    stored,
    events,
  };
}

describe('POST /cards/:id/validate', () => {
  it('validates a TODO card for the moderator (200), stamping who and when, with a VALIDATED event', async () => {
    const { moderator, todoCard, validate, stored, events, time } = await setup();
    const card = todoCard();
    time.now = LATER;

    const res = await validate(moderator, card.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: card.id,
      status: 'TODO',
      validated: true,
      validatedById: moderator.id,
      updatedAt: LATER.toISOString(),
    });
    expect(stored(card.id)).toMatchObject({ validated: true, validatedById: moderator.id, updatedAt: LATER });
    expect(events()).toEqual([
      { cardId: card.id, userId: moderator.id, type: 'VALIDATED', fromStatus: null, toStatus: null },
    ]);
  });

  it("lets the moderator validate a card in the moderator's own row", async () => {
    const { moderator, todoCard, validate } = await setup();
    const own = todoCard({ assigneeId: moderator.id });

    expect((await validate(moderator, own.id)).body.validated).toBe(true);
  });

  it('answers an already validated card with 200 and no new event, even with an old expectedUpdatedAt', async () => {
    const { moderator, todoCard, validate, events, time } = await setup();
    const card = todoCard();
    const first = await validate(moderator, card.id);
    time.now = LATER;

    const again = await validate(moderator, card.id, { expectedUpdatedAt: MONDAY.toISOString() });

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(events()).toHaveLength(1);
  });

  it('refuses cards outside Por hacer (409 CARD_NOT_IN_TODO) without writing', async () => {
    const { db, team, member, moderator, sprint, validate, events } = await setup();
    const backlog = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });
    const doing = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'DOING',
      doneCriteria: 'Demo',
      dueWeekday: 'MON',
      sprintId: sprint.id,
    });

    for (const card of [backlog, doing]) {
      const res = await validate(moderator, card.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CARD_NOT_IN_TODO');
    }
    expect(db.cards.every((card) => !card.validated)).toBe(true);
    expect(events()).toEqual([]);
  });

  it('rejects a stale expectedUpdatedAt (409 CARD_CONFLICT) and accepts the current one', async () => {
    const { moderator, todoCard, validate, stored } = await setup();
    const card = todoCard();

    const stale = await validate(moderator, card.id, { expectedUpdatedAt: '2026-10-18T15:00:00.000Z' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CARD_CONFLICT');
    expect(stored(card.id)?.validated).toBe(false);

    const fresh = await validate(moderator, card.id, { expectedUpdatedAt: MONDAY.toISOString() });
    expect(fresh.status).toBe(200);
    expect((await validate(moderator, card.id, { expectedUpdatedAt: 'yesterday' })).status).toBe(400);
  });

  it('lets only the moderator validate: assignee and teacher 403, outsiders and unknown cards 404', async () => {
    const { teacher, otherTeacher, member, outsider, moderator, todoCard, validate, stored, events } = await setup();
    const card = todoCard();

    const fromMember = await validate(member, card.id);
    expect(fromMember.status).toBe(403);
    expect(fromMember.body.error.code).toBe('FORBIDDEN');
    expect((await validate(teacher, card.id)).status).toBe(403);
    const fromOutsider = await validate(outsider, card.id);
    expect(fromOutsider.status).toBe(404);
    expect(fromOutsider.body.error.code).toBe('CARD_NOT_FOUND');
    expect((await validate(otherTeacher, card.id)).status).toBe(404);
    expect((await validate(moderator, 'nosuchcard')).body).toEqual(fromOutsider.body);
    expect(stored(card.id)?.validated).toBe(false);
    expect(events()).toEqual([]);
  });
});

describe('POST /teams/:id/cards/validate-all', () => {
  it('validates every pending TODO card of the open sprint, in board order, with one event each', async () => {
    const { db, team, otherTeam, member, moderator, sprint, todoCard, validateAll, stored, events, time } =
      await setup();
    const second = todoCard({ id: 'todo2', position: 'a2' });
    const first = todoCard({ id: 'todo1', position: 'a1' });
    const done = todoCard({ id: 'already', position: 'a0' });
    Object.assign(done, { validated: true, validatedById: moderator.id });
    const backlog = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });
    const doing = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'DOING', sprintId: sprint.id });
    const foreign = db.addCard({ teamId: otherTeam.id, assigneeId: null, status: 'TODO' });
    time.now = LATER;

    const res = await validateAll(moderator);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ validatedIds: [first.id, second.id] });
    for (const id of [first.id, second.id]) {
      expect(stored(id)).toMatchObject({ validated: true, validatedById: moderator.id, updatedAt: LATER });
    }
    for (const card of [backlog, doing, foreign]) expect(stored(card.id)?.validated).toBe(false);
    expect(stored(done.id)?.updatedAt).toEqual(MONDAY);
    expect(events()).toEqual([
      { cardId: first.id, userId: moderator.id, type: 'VALIDATED', fromStatus: null, toStatus: null },
      { cardId: second.id, userId: moderator.id, type: 'VALIDATED', fromStatus: null, toStatus: null },
    ]);

    expect((await validateAll(moderator)).body).toEqual({ validatedIds: [] });
  });

  it('refuses a team without an open sprint (409 NO_OPEN_SPRINT)', async () => {
    const { db, moderator, todoCard, validateAll } = await setup();
    const card = todoCard();
    db.sprints.splice(0);

    const res = await validateAll(moderator);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_OPEN_SPRINT');
    expect(card.validated).toBe(false);
  });

  it('lets only the moderator validate all: member and teacher 403, outsiders 404 TEAM_NOT_FOUND', async () => {
    const { teacher, otherTeacher, member, outsider, moderator, todoCard, validateAll, stored } = await setup();
    const card = todoCard();

    const fromMember = await validateAll(member);
    expect(fromMember.status).toBe(403);
    expect(fromMember.body.error.code).toBe('FORBIDDEN');
    expect((await validateAll(teacher)).status).toBe(403);
    const fromOutsider = await validateAll(outsider);
    expect(fromOutsider.status).toBe(404);
    expect(fromOutsider.body.error.code).toBe('TEAM_NOT_FOUND');
    expect((await validateAll(otherTeacher)).status).toBe(404);
    expect((await validateAll(moderator, 'nosuchteam')).status).toBe(404);
    expect(stored(card.id)?.validated).toBe(false);
  });
});

describe('GET /teams/:id/board today', () => {
  const boardToday = async (now: Date, timeZone?: string) => {
    const ctx = await setup();
    if (timeZone) ctx.db.setGroupTimezone(ctx.group.id, timeZone);
    ctx.time.now = now;
    const res = await request(ctx.app)
      .get(`/api/v1/teams/${ctx.team.id}/board`)
      .set('Cookie', await ctx.cookieFor(ctx.member.id));
    return res.body.today;
  };

  it("gives the date and school weekday in the group's time zone, near midnight too", async () => {
    // Wednesday 05:30Z is still Tuesday 23:30 in Monterrey.
    const lateTuesday = new Date('2026-10-21T05:30:00Z');

    expect(await boardToday(lateTuesday)).toEqual({ date: '2026-10-20', weekday: 'TUE' });
    expect(await boardToday(lateTuesday, 'UTC')).toEqual({ date: '2026-10-21', weekday: 'WED' });
    expect(await boardToday(new Date('2026-10-21T06:00:00Z'))).toEqual({ date: '2026-10-21', weekday: 'WED' });
  });

  it('has no weekday on Saturday and Sunday', async () => {
    expect(await boardToday(new Date('2026-10-24T18:00:00Z'))).toEqual({ date: '2026-10-24', weekday: null });
    // Monday 03:00Z is still Sunday evening in Monterrey.
    expect(await boardToday(new Date('2026-10-26T03:00:00Z'))).toEqual({ date: '2026-10-25', weekday: null });
  });
});
