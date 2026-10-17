import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

const NOW = '2026-10-19T15:00:00.000Z';

async function setup() {
  const ctx = buildTestApp();
  const { db } = ctx;
  const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
  const otherTeacher = db.addUser({ username: 'maestro', role: 'TEACHER', passwordHash: 'x' });
  const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });
  const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
  const otherTeam = db.addTeam({ name: 'Bytes', groupId: group.id });
  const student = (username: string, name = username) => {
    const user = db.addUser({ username, name, role: 'STUDENT', passwordHash: 'x' });
    db.addGroupMember(group.id, user.id);
    return user;
  };
  const moderator = student('a0001', 'Ana');
  const member = student('a0002', 'Beto');
  const other = student('a0003', 'Carla');
  const outsider = student('a0004', 'Dani');
  // Inserted out of row order on purpose: the board must follow rowOrder.
  db.addTeamMember({ teamId: team.id, userId: member.id, rowOrder: 1 });
  db.addTeamMember({ teamId: team.id, userId: other.id, rowOrder: 2 });
  db.addTeamMember({ teamId: team.id, userId: moderator.id, isModerator: true, rowOrder: 0 });
  db.addTeamMember({ teamId: otherTeam.id, userId: outsider.id, isModerator: true });
  const project = db.addProject({ teamId: team.id, name: 'Kanbit' });
  const foreignProject = db.addProject({ teamId: otherTeam.id, name: 'Ajeno' });

  const as = (user: { id: string }) => ctx.cookieFor(user.id);
  const api = (path: string) => `/api/v1${path}`;
  const getBoard = async (user: { id: string }, teamId = team.id) =>
    request(ctx.app).get(api(`/teams/${teamId}/board`)).set('Cookie', await as(user));

  return {
    ...ctx,
    teacher,
    otherTeacher,
    team,
    otherTeam,
    moderator,
    member,
    other,
    outsider,
    project,
    foreignProject,
    as,
    api,
    getBoard,
  };
}

describe('GET /teams/:id/board', () => {
  it('returns the team, its rows by rowOrder, no sprint, the projects and the cards', async () => {
    const { db, team, moderator, member, other, project, getBoard } = await setup();
    const card = db.addCard({ teamId: team.id, projectId: project.id, assigneeId: null, status: 'BACKLOG' });

    const res = await getBoard(member);

    expect(res.status).toBe(200);
    expect(res.body.team).toEqual({ id: team.id, name: 'Los Bits', groupId: team.groupId, moderatorId: moderator.id });
    expect(res.body.members).toEqual([
      { userId: moderator.id, name: 'Ana', username: 'a0001', isModerator: true, rowOrder: 0 },
      { userId: member.id, name: 'Beto', username: 'a0002', isModerator: false, rowOrder: 1 },
      { userId: other.id, name: 'Carla', username: 'a0003', isModerator: false, rowOrder: 2 },
    ]);
    expect(res.body.sprint).toBeNull();
    expect(res.body.projects).toEqual([{ id: project.id, teamId: team.id, name: 'Kanbit', updatedAt: NOW }]);
    expect(res.body.cards).toEqual([
      {
        id: card.id,
        teamId: team.id,
        projectId: project.id,
        sprintId: null,
        assigneeId: null,
        title: 'Card',
        doneCriteria: null,
        dueWeekday: null,
        status: 'BACKLOG',
        position: 'a0',
        validated: false,
        validatedById: null,
        carriedOverCount: 0,
        completedAt: null,
        createdById: 'user0',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it('sorts cards by column, then bytewise position, then id', async () => {
    const { db, team, member, getBoard } = await setup();
    const add = (id: string, status: 'BACKLOG' | 'TODO' | 'DOING' | 'DONE', position: string) =>
      db.addCard({ id, teamId: team.id, assigneeId: member.id, status, position });
    add('done1', 'DONE', 'a0');
    add('todo2', 'TODO', 'a1');
    // 'Zz' < 'a0' bytewise; a locale-aware sort would put it last.
    add('todo1', 'TODO', 'Zz');
    add('backlog2', 'BACKLOG', 'a0');
    add('backlog1', 'BACKLOG', 'a0');
    add('doing1', 'DOING', 'a0V');

    const res = await getBoard(member);

    expect(res.body.cards.map((card: { id: string }) => card.id)).toEqual([
      'backlog1',
      'backlog2',
      'todo1',
      'todo2',
      'doing1',
      'done1',
    ]);
  });

  it('includes the open sprint and its cards, but not the cards of closed sprints', async () => {
    const { db, team, member, getBoard } = await setup();
    const closed = db.addSprint({ teamId: team.id, number: 1, status: 'CLOSED' });
    const open = db.addSprint({ teamId: team.id, number: 2, goal: 'Login listo' });
    db.addCard({ id: 'old', teamId: team.id, assigneeId: member.id, status: 'DONE', sprintId: closed.id });
    db.addCard({ id: 'current', teamId: team.id, assigneeId: member.id, status: 'TODO', sprintId: open.id });
    db.addCard({ id: 'backlog', teamId: team.id, assigneeId: null, status: 'BACKLOG' });

    const res = await getBoard(member);

    expect(res.body.sprint).toEqual({
      id: open.id,
      number: 2,
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      goal: 'Login listo',
      status: 'OPEN',
      updatedAt: NOW,
    });
    expect(res.body.cards.map((card: { id: string }) => card.id)).toEqual(['backlog', 'current']);
  });

  it("lets the group's teacher read the board", async () => {
    const { teacher, getBoard } = await setup();

    expect((await getBoard(teacher)).status).toBe(200);
  });

  it('hides the board from students of other teams, other teachers and unknown teams (404)', async () => {
    const { outsider, otherTeacher, member, getBoard } = await setup();

    const fromOutsider = await getBoard(outsider);
    expect(fromOutsider.status).toBe(404);
    expect(fromOutsider.body.error.code).toBe('TEAM_NOT_FOUND');
    expect((await getBoard(otherTeacher)).status).toBe(404);
    expect((await getBoard(member, 'nosuchteam')).status).toBe(404);
  });
});

describe('POST /teams/:id/cards', () => {
  const create = async (
    ctx: Awaited<ReturnType<typeof setup>>,
    user: { id: string },
    body: Record<string, unknown> = {},
    teamId = ctx.team.id,
  ) =>
    request(ctx.app)
      .post(ctx.api(`/teams/${teamId}/cards`))
      .set('Cookie', await ctx.as(user))
      .send({ id: 'newcard1', projectId: ctx.project.id, title: ' Login form ', ...body });

  it('creates an unassigned backlog card with the client id and records a CREATED event (201)', async () => {
    const ctx = await setup();
    const { db, team, member, project } = ctx;

    const res = await create(ctx, member, { doneCriteria: 'Demo en clase', dueWeekday: 'WED' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: 'newcard1',
      teamId: team.id,
      projectId: project.id,
      sprintId: null,
      assigneeId: null,
      title: 'Login form',
      doneCriteria: 'Demo en clase',
      dueWeekday: 'WED',
      status: 'BACKLOG',
      position: 'a0',
      validated: false,
      validatedById: null,
      carriedOverCount: 0,
      completedAt: null,
      createdById: member.id,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(db.cards.find((card) => card.id === 'newcard1')).toBeDefined();
    expect(db.cardEvents).toEqual([
      {
        id: expect.any(String),
        cardId: 'newcard1',
        userId: member.id,
        type: 'CREATED',
        fromStatus: null,
        toStatus: 'BACKLOG',
        createdAt: new Date(NOW),
      },
    ]);
  });

  it('appends the card after the last one of the unassigned backlog cell', async () => {
    const ctx = await setup();
    const { db, team, member, moderator } = ctx;
    db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG', position: 'a0' });
    db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG', position: 'a3' });
    db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG', position: 'Zz' });
    // Cards of other cells and other teams do not count.
    db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG', position: 'a9' });
    db.addCard({ teamId: ctx.otherTeam.id, assigneeId: null, status: 'BACKLOG', position: 'a9' });

    const res = await create(ctx, moderator);

    expect(res.status).toBe(201);
    expect(res.body.position).toBe('a4');
  });

  it('answers a repeated POST from the same author with the existing card (200), without duplicating', async () => {
    const ctx = await setup();
    const { db, member } = ctx;
    const first = await create(ctx, member);

    const again = await create(ctx, member, { title: 'Something else' });

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(db.cards).toHaveLength(1);
    expect(db.cardEvents).toHaveLength(1);
  });

  it('rejects an id that belongs to another author (409 ID_CONFLICT)', async () => {
    const ctx = await setup();
    const { db, member, other } = ctx;
    await create(ctx, member);

    const res = await create(ctx, other);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ID_CONFLICT');
    expect(db.cards).toHaveLength(1);
  });

  it('resolves a concurrent insert of the same id by re-reading it', async () => {
    const ctx = await setup();
    const { db, member, other } = ctx;
    db.raceNextCardCreate = (card) => db.addCard({ ...card, assigneeId: null, createdById: member.id });

    const sameAuthor = await create(ctx, member);
    expect(sameAuthor.status).toBe(200);
    expect(sameAuthor.body.createdById).toBe(member.id);

    db.raceNextCardCreate = (card) => db.addCard({ ...card, id: 'newcard2', assigneeId: null, createdById: member.id });
    const otherAuthor = await create(ctx, other, { id: 'newcard2' });
    expect(otherAuthor.status).toBe(409);
    expect(otherAuthor.body.error.code).toBe('ID_CONFLICT');
  });

  it('forbids the teacher (403 FORBIDDEN) and hides the team from outsiders (404)', async () => {
    const ctx = await setup();
    const { db, teacher, outsider, otherTeacher } = ctx;

    const fromTeacher = await create(ctx, teacher);
    expect(fromTeacher.status).toBe(403);
    expect(fromTeacher.body.error.code).toBe('FORBIDDEN');
    expect((await create(ctx, outsider)).status).toBe(404);
    expect((await create(ctx, otherTeacher)).status).toBe(404);
    expect(db.cards).toHaveLength(0);
  });

  it('rejects a project of another team (400 INVALID_PROJECT) and invalid bodies (400)', async () => {
    const ctx = await setup();
    const { member, foreignProject } = ctx;

    const foreign = await create(ctx, member, { projectId: foreignProject.id });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_PROJECT');
    expect((await create(ctx, member, { projectId: 'nosuchproject' })).body.error.code).toBe('INVALID_PROJECT');

    const invalid = await create(ctx, member, { id: 'Not-A-Cuid!', title: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /cards/:id', () => {
  it('returns the card to team members and the teacher', async () => {
    const { app, db, team, member, teacher, project, api, as } = await setup();
    const card = db.addCard({ teamId: team.id, projectId: project.id, assigneeId: member.id, status: 'BACKLOG' });

    for (const user of [member, teacher]) {
      const res = await request(app).get(api(`/cards/${card.id}`)).set('Cookie', await as(user));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: card.id, teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });
    }
  });

  it('hides it from outsiders exactly like an unknown card (404 CARD_NOT_FOUND)', async () => {
    const { app, db, team, outsider, otherTeacher, api, as } = await setup();
    const card = db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG' });

    const hidden = await request(app).get(api(`/cards/${card.id}`)).set('Cookie', await as(outsider));
    const unknown = await request(app).get(api('/cards/nosuchcard')).set('Cookie', await as(outsider));
    const fromOtherTeacher = await request(app).get(api(`/cards/${card.id}`)).set('Cookie', await as(otherTeacher));

    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('CARD_NOT_FOUND');
    expect(unknown.body).toEqual(hidden.body);
    expect(fromOtherTeacher.status).toBe(404);
  });
});

describe('PATCH /cards/:id', () => {
  const LATER = new Date('2026-10-19T16:30:00Z');

  const patch = async (ctx: Awaited<ReturnType<typeof setup>>, user: { id: string }, id: string, body: object) =>
    request(ctx.app).patch(ctx.api(`/cards/${id}`)).set('Cookie', await ctx.as(user)).send(body);

  it('edits the content fields, bumps updatedAt and records an EDITED event', async () => {
    const ctx = await setup();
    const { db, team, member, project, time } = ctx;
    const second = db.addProject({ teamId: team.id, name: 'Docs' });
    const card = db.addCard({ teamId: team.id, projectId: project.id, assigneeId: null, status: 'BACKLOG' });
    time.now = LATER;

    const res = await patch(ctx, member, card.id, {
      title: ' Nuevo título ',
      doneCriteria: 'Probado en el celular',
      dueWeekday: 'THU',
      projectId: second.id,
      expectedUpdatedAt: NOW,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: card.id,
      title: 'Nuevo título',
      doneCriteria: 'Probado en el celular',
      dueWeekday: 'THU',
      projectId: second.id,
      status: 'BACKLOG',
      position: card.position,
      createdAt: NOW,
      updatedAt: LATER.toISOString(),
    });
    expect(db.cardEvents).toEqual([
      {
        id: expect.any(String),
        cardId: card.id,
        userId: member.id,
        type: 'EDITED',
        fromStatus: null,
        toStatus: null,
        createdAt: LATER,
      },
    ]);
  });

  it('clears done criteria and due weekday in the backlog', async () => {
    const ctx = await setup();
    const { db, team, member } = ctx;
    const card = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'BACKLOG',
      doneCriteria: 'Demo',
      dueWeekday: 'MON',
    });

    const res = await patch(ctx, member, card.id, { doneCriteria: '', dueWeekday: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ doneCriteria: null, dueWeekday: null });
  });

  it('refuses to clear done criteria or due weekday outside the backlog (400 CARD_INCOMPLETE)', async () => {
    const ctx = await setup();
    const { db, team, member } = ctx;
    const card = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'TODO',
      doneCriteria: 'Demo',
      dueWeekday: 'MON',
    });

    const noCriteria = await patch(ctx, member, card.id, { doneCriteria: null });
    const noWeekday = await patch(ctx, member, card.id, { dueWeekday: null });

    expect(noCriteria.status).toBe(400);
    expect(noCriteria.body.error.code).toBe('CARD_INCOMPLETE');
    expect(noWeekday.body.error.code).toBe('CARD_INCOMPLETE');
    expect((await patch(ctx, member, card.id, { doneCriteria: 'Otra demo' })).status).toBe(200);
    expect(db.cards[0]).toMatchObject({ doneCriteria: 'Otra demo', dueWeekday: 'MON' });
  });

  it('rejects a stale expectedUpdatedAt (409 CARD_CONFLICT) without writing', async () => {
    const ctx = await setup();
    const { db, team, member } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG', title: 'Original' });

    const res = await patch(ctx, member, card.id, { title: 'Mine', expectedUpdatedAt: '2026-10-19T14:00:00.000Z' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CARD_CONFLICT');
    expect(db.cards[0]?.title).toBe('Original');
    expect(db.cardEvents).toHaveLength(0);
  });

  it('rejects a project of another team (400 INVALID_PROJECT)', async () => {
    const ctx = await setup();
    const { db, team, member, foreignProject } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });

    const res = await patch(ctx, member, card.id, { projectId: foreignProject.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PROJECT');
  });

  it('lets the moderator edit any card and the assignee their own; others get 403', async () => {
    const ctx = await setup();
    const { db, team, member, other, moderator, teacher } = ctx;
    const betos = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'TODO',
      dueWeekday: 'MON',
      doneCriteria: 'x',
    });
    const unassigned = db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG' });

    expect((await patch(ctx, moderator, betos.id, { title: 'By moderator' })).status).toBe(200);
    expect((await patch(ctx, member, betos.id, { title: 'By assignee' })).status).toBe(200);
    expect((await patch(ctx, other, unassigned.id, { title: 'By any member' })).status).toBe(200);

    const fromOther = await patch(ctx, other, betos.id, { title: 'Not mine' });
    expect(fromOther.status).toBe(403);
    expect(fromOther.body.error.code).toBe('FORBIDDEN');
    expect((await patch(ctx, teacher, unassigned.id, { title: 'Teacher' })).status).toBe(403);
  });

  it('hides the card from outsiders (404) and validates the body (400)', async () => {
    const ctx = await setup();
    const { db, team, member, outsider } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG' });

    const hidden = await patch(ctx, outsider, card.id, { title: 'x' });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('CARD_NOT_FOUND');
    expect((await patch(ctx, member, card.id, {})).body.error.code).toBe('VALIDATION_ERROR');
    expect((await patch(ctx, member, card.id, { title: 'a'.repeat(141) })).status).toBe(400);
  });
});

describe('DELETE /cards/:id', () => {
  const remove = async (ctx: Awaited<ReturnType<typeof setup>>, user: { id: string }, id: string) =>
    request(ctx.app).delete(ctx.api(`/cards/${id}`)).set('Cookie', await ctx.as(user));

  it('deletes a backlog card (204) together with its events', async () => {
    const ctx = await setup();
    const { db, team, member } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });
    const keep = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });
    const event = { userId: member.id, type: 'CREATED', fromStatus: null, toStatus: 'BACKLOG' as const };
    db.cardEvents.push(
      { id: 'e1', cardId: card.id, ...event, createdAt: new Date(NOW) },
      { id: 'e2', cardId: keep.id, ...event, createdAt: new Date(NOW) },
    );

    const res = await remove(ctx, member, card.id);

    expect(res.status).toBe(204);
    expect(db.cards.map((row) => row.id)).toEqual([keep.id]);
    expect(db.cardEvents.map((row) => row.id)).toEqual(['e2']);
  });

  it('refuses cards outside the backlog (409 CARD_NOT_IN_BACKLOG)', async () => {
    const ctx = await setup();
    const { db, team, member, moderator } = ctx;
    const card = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'TODO',
      dueWeekday: 'MON',
      doneCriteria: 'x',
    });

    const res = await remove(ctx, moderator, card.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CARD_NOT_IN_BACKLOG');
    expect(db.cards).toHaveLength(1);
  });

  it('allows the moderator, the assignee or any member for unassigned cards; others 403, outsiders 404', async () => {
    const ctx = await setup();
    const { db, team, member, other, moderator, teacher, outsider } = ctx;
    const betos = () => db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });
    const unassigned = db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG' });
    const target = betos();

    const fromOther = await remove(ctx, other, target.id);
    expect(fromOther.status).toBe(403);
    expect(fromOther.body.error.code).toBe('FORBIDDEN');
    expect((await remove(ctx, teacher, target.id)).status).toBe(403);
    const hidden = await remove(ctx, outsider, target.id);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('CARD_NOT_FOUND');

    expect((await remove(ctx, member, target.id)).status).toBe(204);
    expect((await remove(ctx, moderator, betos().id)).status).toBe(204);
    expect((await remove(ctx, other, unassigned.id)).status).toBe(204);
    expect(db.cards).toHaveLength(0);
  });
});

describe('POST /cards/:id/move', () => {
  const LATER = new Date('2026-10-20T17:45:00Z');

  /** Moves happen during a week: the team has an open sprint unless a test says otherwise. */
  const setupMove = async () => {
    const ctx = await setup();
    return { ...ctx, sprint: ctx.db.addSprint({ teamId: ctx.team.id }) };
  };
  type MoveCtx = Awaited<ReturnType<typeof setupMove>>;

  const move = async (ctx: Awaited<ReturnType<typeof setup>>, user: { id: string }, id: string, body: object) =>
    request(ctx.app).post(ctx.api(`/cards/${id}/move`)).set('Cookie', await ctx.as(user)).send(body);

  /** A validated card of the open sprint, assigned to `assigneeId`. */
  const readyCard = (ctx: MoveCtx, assigneeId: string, status: 'TODO' | 'DOING') =>
    ctx.db.addCard({
      teamId: ctx.team.id,
      assigneeId,
      status,
      dueWeekday: 'MON',
      doneCriteria: 'Demo',
      sprintId: ctx.sprint.id,
      validated: true,
      validatedById: ctx.moderator.id,
    });

  it('claims an unassigned card into the mover row (200), attaching the open sprint (MOVED + ASSIGNED)', async () => {
    const ctx = await setupMove();
    const { db, team, member, project, time, sprint } = ctx;
    const card = db.addCard({ teamId: team.id, projectId: project.id, assigneeId: null, status: 'BACKLOG' });
    time.now = LATER;

    const res = await move(ctx, member, card.id, {
      status: 'TODO',
      assigneeId: member.id,
      position: 'a0',
      dueWeekday: 'WED',
      doneCriteria: 'Demo en clase',
      expectedUpdatedAt: NOW,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: card.id,
      status: 'TODO',
      assigneeId: member.id,
      position: 'a0',
      dueWeekday: 'WED',
      doneCriteria: 'Demo en clase',
      sprintId: sprint.id,
      validated: false,
      completedAt: null,
      updatedAt: LATER.toISOString(),
    });
    expect(db.cards[0]).toMatchObject({ status: 'TODO', assigneeId: member.id });
    const event = { id: expect.any(String), cardId: card.id, userId: member.id, createdAt: LATER };
    expect(db.cardEvents).toEqual([
      { ...event, type: 'MOVED', fromStatus: 'BACKLOG', toStatus: 'TODO' },
      { ...event, type: 'ASSIGNED', fromStatus: null, toStatus: null },
    ]);
  });

  it('writes no event for a pure reorder', async () => {
    const ctx = await setupMove();
    const card = readyCard(ctx, ctx.member.id, 'TODO');

    const res = await move(ctx, ctx.member, card.id, { status: 'TODO', assigneeId: ctx.member.id, position: 'Zz' });

    expect(res.status).toBe(200);
    expect(res.body.position).toBe('Zz');
    expect(ctx.db.cardEvents).toEqual([]);
  });

  it('stamps completedAt from the clock entering DONE and clears it leaving DONE', async () => {
    const ctx = await setupMove();
    const { db, member, time } = ctx;
    const card = readyCard(ctx, member.id, 'DOING');
    time.now = LATER;

    const done = await move(ctx, member, card.id, { status: 'DONE', assigneeId: member.id, position: 'a0' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).toBe(LATER.toISOString());

    const reopened = await move(ctx, member, card.id, { status: 'DOING', assigneeId: member.id, position: 'a0' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.completedAt).toBeNull();
    expect(db.cardEvents.map((event) => [event.type, event.fromStatus, event.toStatus])).toEqual([
      ['MOVED', 'DOING', 'DONE'],
      ['MOVED', 'DONE', 'DOING'],
    ]);
  });

  it("forbids a member moving another member's card (403) and lets the moderator do it (200)", async () => {
    const ctx = await setupMove();
    const { db, member, other, moderator, teacher } = ctx;
    const betos = readyCard(ctx, member.id, 'TODO');
    const target = { status: 'DOING', assigneeId: member.id, position: 'a0' };

    const fromOther = await move(ctx, other, betos.id, target);
    expect(fromOther.status).toBe(403);
    expect(fromOther.body.error.code).toBe('FORBIDDEN');
    // The assignee cannot hand their card to someone else either.
    expect((await move(ctx, member, betos.id, { ...target, assigneeId: other.id })).status).toBe(403);
    expect((await move(ctx, teacher, betos.id, target)).status).toBe(403);
    expect(db.cards[0]?.status).toBe('TODO');
    expect(db.cardEvents).toEqual([]);

    const byModerator = await move(ctx, moderator, betos.id, { ...target, assigneeId: other.id });
    expect(byModerator.status).toBe(200);
    expect(byModerator.body).toMatchObject({ status: 'DOING', assigneeId: other.id });
  });

  it('hides the card from outsiders and other teachers (404 CARD_NOT_FOUND)', async () => {
    const ctx = await setupMove();
    const { db, team, outsider, otherTeacher } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG' });
    const body = { status: 'BACKLOG', assigneeId: null, position: 'a0' };

    const hidden = await move(ctx, outsider, card.id, body);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('CARD_NOT_FOUND');
    expect((await move(ctx, otherTeacher, card.id, body)).status).toBe(404);
    expect((await move(ctx, outsider, 'nosuchcard', body)).body).toEqual(hidden.body);
  });

  it('refuses incomplete cards, outside assignees and malformed positions (400) without writing', async () => {
    const ctx = await setupMove();
    const { db, team, member, moderator, outsider } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: null, status: 'BACKLOG' });

    const incomplete = await move(ctx, member, card.id, { status: 'TODO', assigneeId: member.id, position: 'a0' });
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.error.code).toBe('CARD_INCOMPLETE');

    const complete = { position: 'a0', dueWeekday: 'MON', doneCriteria: 'x' };
    const foreign = await move(ctx, moderator, card.id, { status: 'TODO', assigneeId: outsider.id, ...complete });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('NOT_A_TEAM_MEMBER');

    const badPosition = await move(ctx, member, card.id, { status: 'BACKLOG', assigneeId: null, position: 'a00' });
    expect(badPosition.status).toBe(400);
    expect(badPosition.body.error.code).toBe('INVALID_POSITION');

    const badStatus = await move(ctx, member, card.id, { status: 'LATER', assigneeId: null, position: 'a0' });
    expect(badStatus.body.error.code).toBe('VALIDATION_ERROR');
    expect(db.cards[0]).toMatchObject({ status: 'BACKLOG', assigneeId: null });
    expect(db.cardEvents).toEqual([]);
  });

  it('rejects a stale expectedUpdatedAt (409 CARD_CONFLICT) without writing', async () => {
    const ctx = await setupMove();
    const { db, team, member } = ctx;
    const card = db.addCard({ teamId: team.id, assigneeId: member.id, status: 'BACKLOG' });

    const res = await move(ctx, member, card.id, {
      status: 'BACKLOG',
      assigneeId: null,
      position: 'a0',
      expectedUpdatedAt: '2026-10-19T14:00:00.000Z',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CARD_CONFLICT');
    expect(db.cards[0]?.assigneeId).toBe(member.id);
    expect(db.cardEvents).toEqual([]);
  });

  it('refuses to leave the backlog without an open sprint (409 NO_OPEN_SPRINT) without writing', async () => {
    const ctx = await setup();
    const { db, team, member } = ctx;
    db.addSprint({ teamId: team.id, status: 'CLOSED' });
    const card = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'BACKLOG',
      dueWeekday: 'MON',
      doneCriteria: 'x',
    });

    const res = await move(ctx, member, card.id, { status: 'TODO', assigneeId: member.id, position: 'a0' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_OPEN_SPRINT');
    expect(db.cards[0]).toMatchObject({ status: 'BACKLOG', sprintId: null });
    expect(db.cardEvents).toEqual([]);
    // Reordering inside the backlog needs no sprint.
    const reorder = await move(ctx, member, card.id, { status: 'BACKLOG', assigneeId: member.id, position: 'a5' });
    expect(reorder.status).toBe(200);
  });

  it('refuses an unvalidated card entering DOING or DONE (409 CARD_NOT_VALIDATED), even by the moderator', async () => {
    const ctx = await setupMove();
    const { db, team, member, moderator, sprint } = ctx;
    const card = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'TODO',
      dueWeekday: 'MON',
      doneCriteria: 'x',
      sprintId: sprint.id,
    });

    for (const [user, status] of [
      [member, 'DOING'],
      [moderator, 'DONE'],
    ] as const) {
      const res = await move(ctx, user, card.id, { status, assigneeId: member.id, position: 'a0' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CARD_NOT_VALIDATED');
    }
    expect(db.cards[0]?.status).toBe('TODO');
    expect(db.cardEvents).toEqual([]);
  });

  it('checks permissions (403) before the sprint and validation rules (409)', async () => {
    const ctx = await setup();
    const { db, team, member, other } = ctx;
    const card = db.addCard({
      teamId: team.id,
      assigneeId: member.id,
      status: 'BACKLOG',
      dueWeekday: 'MON',
      doneCriteria: 'x',
    });

    const res = await move(ctx, other, card.id, { status: 'DOING', assigneeId: member.id, position: 'a0' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('back to the backlog detaches the sprint and clears the validation, keeping the assignee', async () => {
    const ctx = await setupMove();
    const { db, member } = ctx;
    const card = readyCard(ctx, member.id, 'DOING');

    const res = await move(ctx, member, card.id, { status: 'BACKLOG', assigneeId: member.id, position: 'a0' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'BACKLOG', assigneeId: member.id, sprintId: null, validated: false });
    expect(db.cards[0]).toMatchObject({ sprintId: null, validated: false, validatedById: null });
  });
});
