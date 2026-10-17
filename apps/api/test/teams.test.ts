import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

async function setup() {
  const ctx = buildTestApp();
  const { db } = ctx;
  const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
  const otherTeacher = db.addUser({ username: 'maestro', role: 'TEACHER', passwordHash: 'x' });
  const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });
  const student = (username: string, name: string) => {
    const user = db.addUser({ username, name, role: 'STUDENT', passwordHash: 'x' });
    db.addGroupMember(group.id, user.id);
    return user;
  };
  const ana = student('a0001', 'Ana');
  const beto = student('a0002', 'Beto');
  const carla = student('a0003', 'Carla');
  const teacherCookie = await ctx.cookieFor(teacher.id);

  const putMembers = (teamId: string, userIds: string[], cookie = teacherCookie) =>
    request(ctx.app).put(`/api/v1/teams/${teamId}/members`).set('Cookie', cookie).send({ userIds });
  const getTeams = async () =>
    (await request(ctx.app).get(`/api/v1/groups/${group.id}/teams`).set('Cookie', teacherCookie)).body as {
      id: string;
      moderatorId: string | null;
      members: { userId: string; rowOrder: number; isModerator: boolean }[];
    }[];

  return { ...ctx, teacher, otherTeacher, group, ana, beto, carla, teacherCookie, putMembers, getTeams };
}

describe('POST /groups/:id/teams and GET /groups/:id/teams', () => {
  it('creates an empty team and lists the group teams', async () => {
    const { app, group, teacherCookie } = await setup();

    const created = await request(app)
      .post(`/api/v1/groups/${group.id}/teams`)
      .set('Cookie', teacherCookie)
      .send({ name: ' Los Bits ' });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      groupId: group.id,
      name: 'Los Bits',
      moderatorId: null,
      updatedAt: '2026-10-19T15:00:00.000Z',
      members: [],
    });
    const list = await request(app).get(`/api/v1/groups/${group.id}/teams`).set('Cookie', teacherCookie);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([created.body]);
  });

  it("hides another teacher's group (404) and forbids students (403)", async () => {
    const { app, group, otherTeacher, ana, cookieFor } = await setup();

    const foreign = await request(app)
      .post(`/api/v1/groups/${group.id}/teams`)
      .set('Cookie', await cookieFor(otherTeacher.id))
      .send({ name: 'Mio' });
    const student = await request(app)
      .get(`/api/v1/groups/${group.id}/teams`)
      .set('Cookie', await cookieFor(ana.id));

    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('GROUP_NOT_FOUND');
    expect(student.status).toBe(403);
  });
});

describe('PATCH /teams/:id', () => {
  it('renames the team', async () => {
    const { app, db, group, teacherCookie } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });

    const res = await request(app).patch(`/api/v1/teams/${team.id}`).set('Cookie', teacherCookie).send({ name: 'Bytes' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: team.id, name: 'Bytes' });
  });

  it("hides another teacher's team as 404 TEAM_NOT_FOUND", async () => {
    const { app, db, group, otherTeacher, cookieFor } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });

    const res = await request(app)
      .patch(`/api/v1/teams/${team.id}`)
      .set('Cookie', await cookieFor(otherTeacher.id))
      .send({ name: 'Mio' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
    expect(db.teams[0]?.name).toBe('Los Bits');
  });
});

describe('PUT /teams/:id/members', () => {
  it('sets members in the given row order and makes the first one moderator', async () => {
    const { db, group, ana, beto, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });

    const res = await putMembers(team.id, [beto.id, ana.id]);

    expect(res.status).toBe(200);
    expect(res.body.moderatorId).toBe(beto.id);
    expect(res.body.members).toEqual([
      { userId: beto.id, name: 'Beto', username: 'a0002', isModerator: true, rowOrder: 0 },
      { userId: ana.id, name: 'Ana', username: 'a0001', isModerator: false, rowOrder: 1 },
    ]);
  });

  it('keeps the moderator while they stay and hands the role over when they leave', async () => {
    const { db, group, ana, beto, carla, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    await putMembers(team.id, [ana.id, beto.id]);

    const kept = await putMembers(team.id, [carla.id, beto.id, ana.id]);
    expect(kept.body.moderatorId).toBe(ana.id);

    const handedOver = await putMembers(team.id, [carla.id, beto.id]);
    expect(handedOver.body.moderatorId).toBe(carla.id);
    expect(handedOver.body.members.map((m: { userId: string }) => m.userId)).toEqual([carla.id, beto.id]);

    const emptied = await putMembers(team.id, []);
    expect(emptied.body).toMatchObject({ moderatorId: null, members: [] });
  });

  it('moves a student from another team of the group and re-elects that team moderator', async () => {
    const { db, group, ana, beto, carla, putMembers, getTeams } = await setup();
    const teamA = db.addTeam({ name: 'A', groupId: group.id });
    const teamB = db.addTeam({ name: 'B', groupId: group.id });
    await putMembers(teamA.id, [ana.id, beto.id]);

    const res = await putMembers(teamB.id, [carla.id, ana.id]);

    expect(res.status).toBe(200);
    const [a, b] = await getTeams();
    expect(a?.members).toEqual([expect.objectContaining({ userId: beto.id, rowOrder: 0, isModerator: true })]);
    expect(a?.moderatorId).toBe(beto.id);
    expect(b?.members.map((m) => m.userId)).toEqual([carla.id, ana.id]);
    expect(db.teamMembers.filter((row) => row.userId === ana.id)).toHaveLength(1);
  });

  it("sends removed members' unfinished cards back to the backlog unassigned, recording MOVED/ASSIGNED", async () => {
    const { db, group, teacher, ana, beto, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    await putMembers(team.id, [ana.id, beto.id]);
    const doing = db.addCard({
      teamId: team.id,
      assigneeId: ana.id,
      status: 'DOING',
      sprintId: 'sprint1',
      validated: true,
      validatedById: beto.id,
    });
    const backlog = db.addCard({ teamId: team.id, assigneeId: ana.id, status: 'BACKLOG' });
    const done = db.addCard({ teamId: team.id, assigneeId: ana.id, status: 'DONE', sprintId: 'sprint1' });
    const betos = db.addCard({ teamId: team.id, assigneeId: beto.id, status: 'TODO', sprintId: 'sprint1' });

    await putMembers(team.id, [beto.id]);

    expect(doing).toMatchObject({
      status: 'BACKLOG',
      assigneeId: null,
      sprintId: null,
      validated: false,
      validatedById: null,
    });
    expect(backlog).toMatchObject({ status: 'BACKLOG', assigneeId: null });
    expect(done).toMatchObject({ status: 'DONE', assigneeId: ana.id });
    expect(betos).toMatchObject({ status: 'TODO', assigneeId: beto.id });
    // The teacher who changed the team is the author of the history rows.
    const event = { id: expect.any(String), userId: teacher.id, createdAt: expect.any(Date) };
    expect(db.cardEvents).toEqual([
      { ...event, cardId: doing.id, type: 'MOVED', fromStatus: 'DOING', toStatus: 'BACKLOG' },
      { ...event, cardId: doing.id, type: 'ASSIGNED', fromStatus: null, toStatus: null },
      { ...event, cardId: backlog.id, type: 'ASSIGNED', fromStatus: null, toStatus: null },
    ]);
  });

  it('rejects users who are not students of the group with 400 INVALID_MEMBERS and changes nothing', async () => {
    const { db, group, teacher, ana, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    const stranger = db.addUser({ username: 'b0001', role: 'STUDENT', passwordHash: 'x' });

    const res = await putMembers(team.id, [ana.id, stranger.id, teacher.id, 'nosuchuser']);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MEMBERS');
    expect(res.body.error.details).toEqual({ userIds: [stranger.id, teacher.id, 'nosuchuser'] });
    expect(db.teamMembers).toHaveLength(0);
  });

  it('rejects duplicate ids with 400 VALIDATION_ERROR', async () => {
    const { db, group, ana, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });

    const res = await putMembers(team.id, [ana.id, ana.id]);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it("hides another teacher's team (404) and forbids students (403)", async () => {
    const { db, group, otherTeacher, ana, putMembers, cookieFor } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });

    expect((await putMembers(team.id, [ana.id], await cookieFor(otherTeacher.id))).status).toBe(404);
    expect((await putMembers(team.id, [ana.id], await cookieFor(ana.id))).status).toBe(403);
    expect(db.teamMembers).toHaveLength(0);
  });

  it('answers 409 MEMBERS_CONFLICT when a concurrent change breaks a membership key', async () => {
    const { db, group, ana, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    const racer = db.addTeam({ name: 'Racer', groupId: group.id });
    // Simulates another request inserting Ana into a team after this one read the group's teams.
    const original = db.teamsRepository.listByGroup;
    db.teamsRepository.listByGroup = async (groupId) => {
      const teams = await original(groupId);
      db.addTeamMember({ teamId: racer.id, userId: ana.id });
      return teams;
    };

    const res = await putMembers(team.id, [ana.id]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBERS_CONFLICT');
  });
});

describe('PATCH /teams/:id/moderator', () => {
  it('designates a member as the only moderator', async () => {
    const { app, db, group, ana, beto, teacherCookie, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    await putMembers(team.id, [ana.id, beto.id]);

    const res = await request(app)
      .patch(`/api/v1/teams/${team.id}/moderator`)
      .set('Cookie', teacherCookie)
      .send({ userId: beto.id });

    expect(res.status).toBe(200);
    expect(res.body.moderatorId).toBe(beto.id);
    expect(res.body.members.filter((m: { isModerator: boolean }) => m.isModerator)).toHaveLength(1);
  });

  it('rejects a non-member with 400 NOT_A_TEAM_MEMBER', async () => {
    const { app, db, group, ana, carla, teacherCookie, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    await putMembers(team.id, [ana.id]);

    const res = await request(app)
      .patch(`/api/v1/teams/${team.id}/moderator`)
      .set('Cookie', teacherCookie)
      .send({ userId: carla.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_TEAM_MEMBER');
  });
});

describe('DELETE /teams/:id', () => {
  it('refuses with 409 TEAM_HAS_CARDS while the team has cards', async () => {
    const { app, db, group, ana, teacherCookie } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    db.addCard({ teamId: team.id, assigneeId: ana.id, status: 'BACKLOG' });

    const res = await request(app).delete(`/api/v1/teams/${team.id}`).set('Cookie', teacherCookie);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_HAS_CARDS');
    expect(db.teams).toHaveLength(1);
  });

  it('deletes the team, its memberships and projects, leaving the students unassigned', async () => {
    const { app, db, group, ana, teacherCookie, putMembers } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    await putMembers(team.id, [ana.id]);
    db.addProject({ teamId: team.id, name: 'Kanbit' });

    const res = await request(app).delete(`/api/v1/teams/${team.id}`).set('Cookie', teacherCookie);

    expect(res.status).toBe(204);
    expect(db.teams).toHaveLength(0);
    expect(db.teamMembers).toHaveLength(0);
    expect(db.projects).toHaveLength(0);
    const detail = await request(app).get(`/api/v1/groups/${group.id}`).set('Cookie', teacherCookie);
    expect(detail.body.students.find((s: { id: string }) => s.id === ana.id).teamId).toBeNull();
  });

  it("hides another teacher's team as 404", async () => {
    const { app, db, group, otherTeacher, cookieFor } = await setup();
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });

    const res = await request(app).delete(`/api/v1/teams/${team.id}`).set('Cookie', await cookieFor(otherTeacher.id));

    expect(res.status).toBe(404);
    expect(db.teams).toHaveLength(1);
  });
});
