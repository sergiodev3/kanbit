import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

async function setup() {
  const ctx = buildTestApp();
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

  const as = (user: { id: string }) => ctx.cookieFor(user.id);
  const createProject = async (user: { id: string }, name = 'Kanbit') =>
    request(ctx.app).post(`/api/v1/teams/${team.id}/projects`).set('Cookie', await as(user)).send({ name });

  return { ...ctx, teacher, otherTeacher, team, moderator, member, outsider, as, createProject };
}

describe('POST /teams/:id/projects', () => {
  it('lets the moderator create a project', async () => {
    const { team, moderator, createProject } = await setup();

    const res = await createProject(moderator, ' Kanbit ');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      teamId: team.id,
      name: 'Kanbit',
      updatedAt: '2026-10-19T15:00:00.000Z',
    });
  });

  it("lets the group's teacher create a project", async () => {
    const { teacher, createProject } = await setup();

    expect((await createProject(teacher)).status).toBe(201);
  });

  it('forbids a plain member (403)', async () => {
    const { db, member, createProject } = await setup();

    const res = await createProject(member);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(db.projects).toHaveLength(0);
  });

  it('hides the team from students of other teams and other teachers (404)', async () => {
    const { outsider, otherTeacher, createProject } = await setup();

    const fromOutsider = await createProject(outsider);
    const fromOtherTeacher = await createProject(otherTeacher);

    expect(fromOutsider.status).toBe(404);
    expect(fromOutsider.body.error.code).toBe('TEAM_NOT_FOUND');
    expect(fromOtherTeacher.status).toBe(404);
  });
});

describe('GET /teams/:id/projects', () => {
  it('lets members and the teacher list the team projects', async () => {
    const { app, db, team, member, teacher, as } = await setup();
    const project = db.addProject({ teamId: team.id, name: 'Kanbit' });
    const expected = [{ id: project.id, teamId: team.id, name: 'Kanbit', updatedAt: '2026-10-19T15:00:00.000Z' }];

    for (const user of [member, teacher]) {
      const res = await request(app).get(`/api/v1/teams/${team.id}/projects`).set('Cookie', await as(user));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expected);
    }
  });

  it('hides the projects from students of other teams (404)', async () => {
    const { app, team, outsider, as } = await setup();

    const res = await request(app).get(`/api/v1/teams/${team.id}/projects`).set('Cookie', await as(outsider));

    expect(res.status).toBe(404);
  });
});

describe('PATCH /projects/:id', () => {
  it('lets the moderator and the teacher rename a project', async () => {
    const { app, db, team, moderator, teacher, as } = await setup();
    const project = db.addProject({ teamId: team.id, name: 'Kanbit' });

    const byModerator = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .set('Cookie', await as(moderator))
      .send({ name: 'Kanbit v1' });
    const byTeacher = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .set('Cookie', await as(teacher))
      .send({ name: 'Kanbit v2' });

    expect(byModerator.status).toBe(200);
    expect(byModerator.body.name).toBe('Kanbit v1');
    expect(byTeacher.body).toMatchObject({ id: project.id, name: 'Kanbit v2' });
  });

  it('forbids a plain member (403) and hides it from outsiders as 404 PROJECT_NOT_FOUND', async () => {
    const { app, db, team, member, outsider, as } = await setup();
    const project = db.addProject({ teamId: team.id, name: 'Kanbit' });
    const rename = async (user: { id: string }, id = project.id) =>
      request(app).patch(`/api/v1/projects/${id}`).set('Cookie', await as(user)).send({ name: 'X' });

    expect((await rename(member)).status).toBe(403);
    const hidden = await rename(outsider);
    const unknown = await rename(outsider, 'nosuchproject');
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('PROJECT_NOT_FOUND');
    expect(unknown.body).toEqual(hidden.body);
    expect(db.projects[0]?.name).toBe('Kanbit');
  });
});
