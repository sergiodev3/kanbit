import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

/** Wednesday 21 Oct 2026, 10:00 in Monterrey. */
const WEDNESDAY = new Date('2026-10-21T16:00:00Z');
const LATER = new Date('2026-10-23T20:00:00Z');

async function setup(now = WEDNESDAY) {
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

  const api = (path: string) => `/api/v1${path}`;
  const start = async (user: { id: string }, body: object = { goal: ' Login listo ' }, teamId = team.id) =>
    request(ctx.app)
      .post(api(`/teams/${teamId}/sprints`))
      .set('Cookie', await ctx.cookieFor(user.id))
      .send(body);
  const close = async (user: { id: string }, sprintId: string) =>
    request(ctx.app)
      .post(api(`/sprints/${sprintId}/close`))
      .set('Cookie', await ctx.cookieFor(user.id))
      .send();
  const board = async (user: { id: string }) =>
    request(ctx.app)
      .get(api(`/teams/${team.id}/board`))
      .set('Cookie', await ctx.cookieFor(user.id));

  return { ...ctx, teacher, otherTeacher, group, team, otherTeam, moderator, member, outsider, start, close, board };
}

describe('POST /teams/:id/sprints', () => {
  it("starts the week's sprint for the moderator (201) and shows it on the board", async () => {
    const { team, moderator, member, start, board } = await setup();

    const res = await start(moderator);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      teamId: team.id,
      number: 1,
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      goal: 'Login listo',
      status: 'OPEN',
      updatedAt: WEDNESDAY.toISOString(),
    });
    const { teamId: _teamId, ...boardSprint } = res.body;
    expect((await board(member)).body.sprint).toEqual(boardSprint);
  });

  it('plans next week when started on a weekend', async () => {
    const { moderator, start } = await setup(new Date('2026-10-24T18:00:00Z'));

    const res = await start(moderator);

    expect(res.body).toMatchObject({ startDate: '2026-10-26', endDate: '2026-10-30' });
  });

  it("decides the day in the group's time zone", async () => {
    // Saturday 02:00Z: still Friday in Monterrey, already Saturday in UTC.
    const fridayNight = new Date('2026-10-24T02:00:00Z');
    const monterrey = await setup(fridayNight);
    const utc = await setup(fridayNight);
    utc.db.setGroupTimezone(utc.group.id, 'UTC');

    expect((await monterrey.start(monterrey.moderator)).body.startDate).toBe('2026-10-19');
    expect((await utc.start(utc.moderator)).body.startDate).toBe('2026-10-26');
  });

  it('numbers the sprint after the last one, even within the same week after a close', async () => {
    const { db, team, moderator, start } = await setup();
    db.addSprint({ teamId: team.id, number: 1, status: 'CLOSED' });
    db.addSprint({ teamId: team.id, number: 3, status: 'CLOSED' });

    const res = await start(moderator);

    expect(res.status).toBe(201);
    expect(res.body.number).toBe(4);
  });

  it('refuses a second open sprint (409 SPRINT_ALREADY_OPEN), also when a concurrent start wins', async () => {
    const { db, team, moderator, start } = await setup();
    const first = await start(moderator);
    expect(first.status).toBe(201);

    const again = await start(moderator);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SPRINT_ALREADY_OPEN');

    db.sprints.splice(0);
    db.raceNextSprintCreate = () => db.addSprint({ teamId: team.id, number: 7 });
    const raced = await start(moderator);
    expect(raced.status).toBe(409);
    expect(raced.body.error.code).toBe('SPRINT_ALREADY_OPEN');
    expect(db.sprints).toHaveLength(1);
  });

  it('lets only the moderator start: teacher and member 403, outsiders 404', async () => {
    const { db, teacher, otherTeacher, member, outsider, moderator, start } = await setup();

    const fromTeacher = await start(teacher);
    expect(fromTeacher.status).toBe(403);
    expect(fromTeacher.body.error.code).toBe('FORBIDDEN');
    expect((await start(member)).status).toBe(403);
    const fromOutsider = await start(outsider);
    expect(fromOutsider.status).toBe(404);
    expect(fromOutsider.body.error.code).toBe('TEAM_NOT_FOUND');
    expect((await start(otherTeacher)).status).toBe(404);
    expect((await start(moderator, { goal: 'x' }, 'nosuchteam')).status).toBe(404);
    expect(db.sprints).toHaveLength(0);
  });

  it('requires a goal of 1..200 characters (400)', async () => {
    const { db, moderator, start } = await setup();

    expect((await start(moderator, {})).body.error.code).toBe('VALIDATION_ERROR');
    expect((await start(moderator, { goal: '   ' })).status).toBe(400);
    expect((await start(moderator, { goal: 'a'.repeat(201) })).status).toBe(400);
    expect(db.sprints).toHaveLength(0);
  });

  it('adopts orphan cards outside the backlog, keeping their validation', async () => {
    const { db, team, otherTeam, member, moderator, start } = await setup();
    const cell = { teamId: team.id, assigneeId: member.id, doneCriteria: 'x', dueWeekday: 'MON' } as const;
    const todo = db.addCard({ ...cell, status: 'TODO' });
    const doing = db.addCard({ ...cell, status: 'DOING', validated: true, validatedById: moderator.id });
    const backlog = db.addCard({ ...cell, status: 'BACKLOG' });
    const foreign = db.addCard({ teamId: otherTeam.id, assigneeId: null, status: 'TODO' });
    const closed = db.addSprint({ teamId: team.id, status: 'CLOSED' });
    const done = db.addCard({ ...cell, status: 'DONE', sprintId: closed.id });

    const res = await start(moderator);

    const stored = (id: string) => db.cards.find((row) => row.id === id);
    expect(stored(todo.id)).toMatchObject({ sprintId: res.body.id, validated: false });
    expect(stored(doing.id)).toMatchObject({ sprintId: res.body.id, validated: true, validatedById: moderator.id });
    expect(stored(backlog.id)?.sprintId).toBeNull();
    expect(stored(foreign.id)?.sprintId).toBeNull();
    expect(stored(done.id)?.sprintId).toBe(closed.id);
  });
});

describe('POST /sprints/:id/close', () => {
  it('sends unfinished cards back to the backlog keeping the assignee; DONE cards leave the board', async () => {
    const { db, team, moderator, member, close, board, time } = await setup();
    const sprint = db.addSprint({ teamId: team.id, goal: 'Login listo' });
    const inSprint = {
      teamId: team.id,
      assigneeId: member.id,
      doneCriteria: 'x',
      dueWeekday: 'MON',
      sprintId: sprint.id,
      validated: true,
      validatedById: moderator.id,
    } as const;
    db.addCard({ id: 'backlog1', teamId: team.id, assigneeId: member.id, status: 'BACKLOG', position: 'a2' });
    const todo = db.addCard({ ...inSprint, id: 'todo1', status: 'TODO', position: 'a0', carriedOverCount: 1 });
    const doing = db.addCard({ ...inSprint, id: 'doing1', status: 'DOING', position: 'a0' });
    const done = db.addCard({ ...inSprint, id: 'done1', status: 'DONE', position: 'a0', completedAt: WEDNESDAY });
    time.now = LATER;

    const res = await close(moderator, sprint.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sprint: {
        id: sprint.id,
        teamId: team.id,
        number: 1,
        startDate: '2026-10-19',
        endDate: '2026-10-23',
        goal: 'Login listo',
        status: 'CLOSED',
        updatedAt: LATER.toISOString(),
      },
      returnedCardIds: [todo.id, doing.id],
    });
    const back = { status: 'BACKLOG', assigneeId: member.id, sprintId: null, validated: false, validatedById: null };
    expect(db.cards.find((row) => row.id === todo.id)).toMatchObject({
      ...back,
      position: 'a3',
      carriedOverCount: 1,
      updatedAt: LATER,
    });
    expect(db.cards.find((row) => row.id === doing.id)).toMatchObject({ ...back, position: 'a4' });
    expect(db.cards.find((row) => row.id === done.id)).toMatchObject({ status: 'DONE', sprintId: sprint.id });
    const history = db.cardEvents.map(({ cardId, userId, type, fromStatus, toStatus }) => ({
      cardId,
      userId,
      type,
      fromStatus,
      toStatus,
    }));
    expect(history).toEqual([
      { cardId: todo.id, userId: moderator.id, type: 'MOVED', fromStatus: 'TODO', toStatus: 'BACKLOG' },
      { cardId: doing.id, userId: moderator.id, type: 'MOVED', fromStatus: 'DOING', toStatus: 'BACKLOG' },
    ]);

    const after = await board(member);
    expect(after.body.sprint).toBeNull();
    expect(after.body.cards.map((card: { id: string }) => card.id)).toEqual(['backlog1', todo.id, doing.id]);
  });

  it('refuses an already closed sprint (409 SPRINT_CLOSED)', async () => {
    const { db, team, moderator, close } = await setup();
    const sprint = db.addSprint({ teamId: team.id });
    expect((await close(moderator, sprint.id)).status).toBe(200);

    const again = await close(moderator, sprint.id);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SPRINT_CLOSED');
  });

  it("lets the group's teacher close; members get 403 and outsiders 404 SPRINT_NOT_FOUND", async () => {
    const { db, team, teacher, otherTeacher, member, outsider, close } = await setup();
    const sprint = db.addSprint({ teamId: team.id });

    const fromMember = await close(member, sprint.id);
    expect(fromMember.status).toBe(403);
    expect(fromMember.body.error.code).toBe('FORBIDDEN');
    const fromOutsider = await close(outsider, sprint.id);
    expect(fromOutsider.status).toBe(404);
    expect(fromOutsider.body.error.code).toBe('SPRINT_NOT_FOUND');
    expect((await close(otherTeacher, sprint.id)).status).toBe(404);
    expect((await close(teacher, 'nosuchsprint')).body).toEqual(fromOutsider.body);
    expect(db.sprints[0]?.status).toBe('OPEN');

    const fromTeacher = await close(teacher, sprint.id);
    expect(fromTeacher.status).toBe(200);
    expect(fromTeacher.body.sprint.status).toBe('CLOSED');
  });
});
