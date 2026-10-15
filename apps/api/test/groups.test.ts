import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

async function setup() {
  const ctx = buildTestApp();
  const teacher = ctx.db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
  const otherTeacher = ctx.db.addUser({ username: 'maestro', role: 'TEACHER', passwordHash: 'x' });
  const student = ctx.db.addUser({ username: 'a0001', name: 'Ana', role: 'STUDENT', passwordHash: 'x' });
  const as = async (user: { id: string }) => ctx.cookieFor(user.id);
  return { ...ctx, teacher, otherTeacher, student, as };
}

describe('POST /groups and GET /groups', () => {
  it('creates a group with a generated access code and lists it with counts', async () => {
    const { app, teacher, as } = await setup();
    const cookie = await as(teacher);

    const created = await request(app).post('/api/v1/groups').set('Cookie', cookie).send({ name: ' 5A Prog ' });

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      name: '5A Prog',
      accessCode: expect.stringMatching(/^[A-HJKMNP-Z2-9]{6}$/),
      accessOpen: true,
      updatedAt: '2026-10-19T15:00:00.000Z',
    });

    const list = await request(app).get('/api/v1/groups').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ ...created.body, teamCount: 0, studentCount: 0 }]);
  });

  it('lists only the groups the teacher teaches', async () => {
    const { app, db, teacher, otherTeacher, as } = await setup();
    db.addGroup({ name: 'Ajeno', accessCode: 'ZZZZZZ', teacherId: otherTeacher.id });

    const list = await request(app).get('/api/v1/groups').set('Cookie', await as(teacher));

    expect(list.body).toEqual([]);
  });

  it('rejects a blank name with 400 VALIDATION_ERROR', async () => {
    const { app, teacher, as } = await setup();

    const res = await request(app).post('/api/v1/groups').set('Cookie', await as(teacher)).send({ name: ' ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('forbids students (403) and anonymous callers (401)', async () => {
    const { app, student, as } = await setup();
    const cookie = await as(student);

    expect((await request(app).get('/api/v1/groups').set('Cookie', cookie)).status).toBe(403);
    const post = await request(app).post('/api/v1/groups').set('Cookie', cookie).send({ name: '5A' });
    expect(post.status).toBe(403);
    expect(post.body.error.code).toBe('FORBIDDEN');
    expect((await request(app).get('/api/v1/groups')).status).toBe(401);
  });
});

describe('GET /groups/:id', () => {
  it('returns the code, registration state, students with their team, and team summaries', async () => {
    const { app, db, teacher, student, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });
    const beto = db.addUser({ username: 'a0002', name: 'Beto', role: 'STUDENT', passwordHash: 'x' });
    db.addGroupMember(group.id, student.id);
    db.addGroupMember(group.id, beto.id);
    const team = db.addTeam({ name: 'Los Bits', groupId: group.id });
    db.addTeamMember({ teamId: team.id, userId: beto.id, isModerator: true });

    const res = await request(app).get(`/api/v1/groups/${group.id}`).set('Cookie', await as(teacher));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: group.id,
      name: '5A',
      accessCode: 'AB23CD',
      accessOpen: true,
      updatedAt: '2026-10-19T15:00:00.000Z',
      students: [
        { id: student.id, name: 'Ana', username: 'a0001', teamId: null },
        { id: beto.id, name: 'Beto', username: 'a0002', teamId: team.id },
      ],
      teams: [{ id: team.id, name: 'Los Bits', moderatorId: beto.id, memberCount: 1 }],
    });
  });

  it("answers 404 GROUP_NOT_FOUND for another teacher's group and for unknown ids", async () => {
    const { app, db, teacher, otherTeacher, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });
    const cookie = await as(otherTeacher);

    const foreign = await request(app).get(`/api/v1/groups/${group.id}`).set('Cookie', cookie);
    const unknown = await request(app).get('/api/v1/groups/nosuchgroup').set('Cookie', cookie);

    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('GROUP_NOT_FOUND');
    expect(unknown.body).toEqual(foreign.body);
  });

  it('rejects a malformed id with 400', async () => {
    const { app, teacher, as } = await setup();

    const res = await request(app).get('/api/v1/groups/Not-A-Cuid!').set('Cookie', await as(teacher));

    expect(res.status).toBe(400);
  });
});

describe('PATCH /groups/:id', () => {
  it('renames the group and closes registration, which then rejects new students', async () => {
    const { app, db, teacher, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });

    const res = await request(app)
      .patch(`/api/v1/groups/${group.id}`)
      .set('Cookie', await as(teacher))
      .send({ name: '5B', accessOpen: false });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: group.id, name: '5B', accessOpen: false, accessCode: 'AB23CD' });
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ accessCode: 'ab23cd', name: 'Ana', username: 'a0009', password: 'student-pass' });
    expect(register.status).toBe(403);
    expect(register.body.error.code).toBe('REGISTRATION_CLOSED');
  });

  it('requires at least one editable field', async () => {
    const { app, db, teacher, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });

    const res = await request(app)
      .patch(`/api/v1/groups/${group.id}`)
      .set('Cookie', await as(teacher))
      .send({ accessCode: 'HACKED' });

    expect(res.status).toBe(400);
    expect(db.groups[0]?.accessCode).toBe('AB23CD');
  });

  it("does not let another teacher edit the group (404)", async () => {
    const { app, db, teacher, otherTeacher, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });

    const res = await request(app)
      .patch(`/api/v1/groups/${group.id}`)
      .set('Cookie', await as(otherTeacher))
      .send({ name: 'Mio' });

    expect(res.status).toBe(404);
    expect(db.groups[0]?.name).toBe('5A');
  });
});

describe('POST /groups/:id/access-code/regenerate', () => {
  it('replaces the code so the old one no longer registers students', async () => {
    const { app, db, teacher, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });

    const res = await request(app)
      .post(`/api/v1/groups/${group.id}/access-code/regenerate`)
      .set('Cookie', await as(teacher));

    expect(res.status).toBe(200);
    expect(res.body.accessCode).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(res.body.accessCode).not.toBe('AB23CD');
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ accessCode: 'AB23CD', name: 'Ana', username: 'a0009', password: 'student-pass' });
    expect(register.body.error.code).toBe('INVALID_ACCESS_CODE');
  });

  it("does not let another teacher regenerate the code (404)", async () => {
    const { app, db, teacher, otherTeacher, as } = await setup();
    const group = db.addGroup({ name: '5A', accessCode: 'AB23CD', teacherId: teacher.id });

    const res = await request(app)
      .post(`/api/v1/groups/${group.id}/access-code/regenerate`)
      .set('Cookie', await as(otherTeacher));

    expect(res.status).toBe(404);
    expect(db.groups[0]?.accessCode).toBe('AB23CD');
  });
});
