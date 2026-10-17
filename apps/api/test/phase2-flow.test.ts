import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

interface Student {
  id: string;
  cookie: string;
}

describe('phase 2 done criterion (spec §12.1)', () => {
  it('students move their own cards; moving a classmate card is 403 unless moderating; the teacher reads', async () => {
    const { app, db, cookieFor } = buildTestApp();
    const api = (path: string) => `/api/v1${path}`;
    const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
    const teacherCookie = await cookieFor(teacher.id);

    const group = await request(app).post(api('/groups')).set('Cookie', teacherCookie).send({ name: '5A Prog' });
    expect(group.status).toBe(201);
    const register = async (username: string, name: string): Promise<Student> => {
      const res = await request(app)
        .post(api('/auth/register'))
        .send({ accessCode: group.body.accessCode, name, username, password: 'student-pass' });
      expect(res.status).toBe(201);
      const id: string = res.body.user.id;
      return { id, cookie: await cookieFor(id) };
    };
    const ana = await register('a0001', 'Ana');
    const beto = await register('a0002', 'Beto');
    const carla = await register('a0003', 'Carla');

    const team = await request(app)
      .post(api(`/groups/${group.body.id}/teams`))
      .set('Cookie', teacherCookie)
      .send({ name: 'Los Bits' });
    const teamId: string = team.body.id;
    const members = await request(app)
      .put(api(`/teams/${teamId}/members`))
      .set('Cookie', teacherCookie)
      .send({ userIds: [ana.id, beto.id, carla.id] });
    // The first member listed moderates.
    expect(members.body.moderatorId).toBe(ana.id);
    const project = await request(app)
      .post(api(`/teams/${teamId}/projects`))
      .set('Cookie', ana.cookie)
      .send({ name: 'Kanbit' });
    expect(project.status).toBe(201);
    // Phase 3: cards leave the Backlog only into an open sprint.
    const sprint = await request(app)
      .post(api(`/teams/${teamId}/sprints`))
      .set('Cookie', ana.cookie)
      .send({ goal: 'Primer sprint' });
    expect(sprint.status).toBe(201);

    const createCard = async (student: Student, id: string, title: string) => {
      const res = await request(app)
        .post(api(`/teams/${teamId}/cards`))
        .set('Cookie', student.cookie)
        .send({ id, projectId: project.body.id, title, doneCriteria: 'Demo en clase', dueWeekday: 'WED' });
      expect(res.status).toBe(201);
      return id;
    };
    const betoCard = await createCard(beto, 'betocard0001', 'Login');
    const carlaCard = await createCard(carla, 'carlacard001', 'Tablero');

    const move = (cookie: string, cardId: string, body: object) =>
      request(app).post(api(`/cards/${cardId}/move`)).set('Cookie', cookie).send(body);
    // Stands in for the moderator's validation (its endpoint arrives with phase 3 T2).
    const validate = (cardId: string) => {
      const card = db.cards.find((row) => row.id === cardId);
      if (!card) throw new Error(`unknown card ${cardId}`);
      Object.assign(card, { validated: true, validatedById: ana.id });
    };

    // Each student takes their own card into their row ("Por hacer"), then starts it ("En marcha").
    for (const [student, cardId] of [
      [beto, betoCard],
      [carla, carlaCard],
    ] as const) {
      const todo = await move(student.cookie, cardId, { status: 'TODO', assigneeId: student.id, position: 'a0' });
      expect(todo.status).toBe(200);
      validate(cardId);
      const doing = await move(student.cookie, cardId, { status: 'DOING', assigneeId: student.id, position: 'a0' });
      expect(doing.status).toBe(200);
    }

    const stolen = await move(beto.cookie, carlaCard, { status: 'DONE', assigneeId: carla.id, position: 'a0' });
    expect(stolen.status).toBe(403);
    expect(stolen.body.error.code).toBe('FORBIDDEN');

    const byModerator = await move(ana.cookie, carlaCard, { status: 'DONE', assigneeId: carla.id, position: 'a0' });
    expect(byModerator.status).toBe(200);
    const byTeacher = await move(teacherCookie, betoCard, { status: 'DONE', assigneeId: beto.id, position: 'a0' });
    expect(byTeacher.status).toBe(403);

    const board = await request(app).get(api(`/teams/${teamId}/board`)).set('Cookie', teacherCookie);
    const cells = (board.body.cards as { id: string; status: string; assigneeId: string }[]).map((card) => [
      card.id,
      card.status,
      card.assigneeId,
    ]);
    expect(cells).toEqual([
      [betoCard, 'DOING', beto.id],
      [carlaCard, 'DONE', carla.id],
    ]);
  });
});
