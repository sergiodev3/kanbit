import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

describe('phase 1 done criterion (spec §12.1)', () => {
  it('teacher creates a group; two students register with its code and end up in one team', async () => {
    const { app, db, cookieFor } = buildTestApp();
    const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
    const teacherCookie = await cookieFor(teacher.id);

    const group = await request(app).post('/api/v1/groups').set('Cookie', teacherCookie).send({ name: '5A Prog' });
    expect(group.status).toBe(201);

    const register = (username: string, name: string) =>
      request(app)
        .post('/api/v1/auth/register')
        .send({ accessCode: group.body.accessCode.toLowerCase(), name, username, password: 'student-pass' });
    const ana = await register('a0001', 'Ana');
    const beto = await register('a0002', 'Beto');
    expect([ana.status, beto.status]).toEqual([201, 201]);
    const anaId: string = ana.body.user.id;
    const betoId: string = beto.body.user.id;

    const team = await request(app)
      .post(`/api/v1/groups/${group.body.id}/teams`)
      .set('Cookie', teacherCookie)
      .send({ name: 'Los Bits' });
    const members = await request(app)
      .put(`/api/v1/teams/${team.body.id}/members`)
      .set('Cookie', teacherCookie)
      .send({ userIds: [anaId, betoId] });
    expect(members.status).toBe(200);

    const detail = await request(app).get(`/api/v1/groups/${group.body.id}`).set('Cookie', teacherCookie);
    expect(detail.body.students).toEqual([
      { id: anaId, name: 'Ana', username: 'a0001', teamId: team.body.id },
      { id: betoId, name: 'Beto', username: 'a0002', teamId: team.body.id },
    ]);
    expect(detail.body.teams).toEqual([{ id: team.body.id, name: 'Los Bits', moderatorId: anaId, memberCount: 2 }]);

    // The student's own session now reports the team and the moderator role.
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', await cookieFor(anaId));
    expect(me.body.memberships).toEqual([
      { groupId: group.body.id, groupName: '5A Prog', teamId: team.body.id, teamName: 'Los Bits', isModerator: true },
    ]);
  });
});
