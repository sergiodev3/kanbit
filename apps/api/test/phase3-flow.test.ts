import { type BoardResponse, type CardResponse, cardVisualState } from '@kanbit/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './support/app';

interface Student {
  id: string;
  cookie: string;
}

/** Instants of the week of Mon 19 Oct 2026; Monterrey is UTC-6. */
const SATURDAY = new Date('2026-10-17T18:00:00Z');
const SUNDAY = new Date('2026-10-18T19:00:00Z');
const MONDAY = new Date('2026-10-19T15:00:00Z');
const TUESDAY = new Date('2026-10-20T15:00:00Z');
const WEDNESDAY = new Date('2026-10-21T15:00:00Z');
const THURSDAY = new Date('2026-10-22T17:30:00Z');
const FRIDAY = new Date('2026-10-23T22:00:00Z');
const NEXT_MONDAY = new Date('2026-10-26T14:00:00Z');

describe('phase 3 done criterion (spec §12.1): a Monday–Friday sprint on the injected clock', () => {
  it('starts, plans, validates, executes and closes the weekly sprint, then starts the next one', async () => {
    const { app, db, time, cookieFor } = buildTestApp({ now: SATURDAY });
    const api = (path: string) => `/api/v1${path}`;
    const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'x' });
    let teacherCookie = await cookieFor(teacher.id);

    // Saturday: the teacher sets up the group and the team.
    const group = await request(app).post(api('/groups')).set('Cookie', teacherCookie).send({ name: '5A Prog' });
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
    await request(app)
      .put(api(`/teams/${teamId}/members`))
      .set('Cookie', teacherCookie)
      .send({ userIds: [ana.id, beto.id, carla.id] });
    const project = await request(app)
      .post(api(`/teams/${teamId}/projects`))
      .set('Cookie', ana.cookie)
      .send({ name: 'Kanbit' });

    const board = async (cookie = teacherCookie): Promise<BoardResponse> => {
      const res = await request(app).get(api(`/teams/${teamId}/board`)).set('Cookie', cookie);
      expect(res.status).toBe(200);
      return res.body;
    };
    const startSprint = (goal: string) =>
      request(app).post(api(`/teams/${teamId}/sprints`)).set('Cookie', ana.cookie).send({ goal });
    const createCard = async (student: Student, id: string, title: string) => {
      const res = await request(app)
        .post(api(`/teams/${teamId}/cards`))
        .set('Cookie', student.cookie)
        .send({ id, projectId: project.body.id, title });
      expect(res.status).toBe(201);
      return id;
    };
    const move = (student: Student, cardId: string, body: object) =>
      request(app).post(api(`/cards/${cardId}/move`)).set('Cookie', student.cookie).send(body);
    const plan = async (student: Student, cardId: string, dueWeekday: string, position: string) => {
      const res = await move(student, cardId, {
        status: 'TODO',
        assigneeId: student.id,
        position,
        dueWeekday,
        doneCriteria: 'Se demuestra en clase',
      });
      expect(res.status).toBe(200);
      return res.body as CardResponse;
    };
    const advance = async (student: Student, cardId: string, status: 'DOING' | 'DONE') => {
      const res = await move(student, cardId, { status, assigneeId: student.id, position: 'a0' });
      expect(res.status).toBe(200);
      return res.body as CardResponse;
    };

    // Sunday: the moderator starts sprint 1; on a weekend it plans the coming Monday–Friday.
    time.now = SUNDAY;
    expect((await board()).today).toEqual({ date: '2026-10-18', weekday: null });
    const sprint1 = await startSprint('Login y tablero');
    expect(sprint1.status).toBe(201);
    expect(sprint1.body).toMatchObject({ number: 1, startDate: '2026-10-19', endDate: '2026-10-23', status: 'OPEN' });

    // Monday (Arranque): members plan their cards into Por hacer with a day and a done criterion.
    time.now = MONDAY;
    const login = await createCard(beto, 'betologin001', 'Login');
    const api1 = await createCard(beto, 'betoapi00001', 'API de tarjetas');
    const tablero = await createCard(carla, 'carlaboard01', 'Tablero');
    expect((await plan(beto, login, 'MON', 'a0')).sprintId).toBe(sprint1.body.id);
    await plan(beto, api1, 'TUE', 'a1');
    const planned = await plan(carla, tablero, 'WED', 'a0');
    expect(planned).toMatchObject({ sprintId: sprint1.body.id, validated: false });

    // Not validated yet: it cannot start.
    const tooEarly = await move(beto, login, { status: 'DOING', assigneeId: beto.id, position: 'a0' });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('CARD_NOT_VALIDATED');

    // The moderator validates one card, then all the remaining ones.
    const single = await request(app).post(api(`/cards/${login}/validate`)).set('Cookie', ana.cookie).send();
    expect(single.body).toMatchObject({ validated: true, validatedById: ana.id });
    const all = await request(app).post(api(`/teams/${teamId}/cards/validate-all`)).set('Cookie', ana.cookie).send();
    expect(all.status).toBe(200);
    // Board order: Por hacer column, then position (Carla's 'a0' before Beto's 'a1').
    expect(all.body).toEqual({ validatedIds: [tablero, api1] });

    // Tuesday: a late card is planned and stays pending; the board's "today" drives the visual states.
    time.now = TUESDAY;
    const estilos = await createCard(carla, 'carlastyles1', 'Estilos');
    await plan(carla, estilos, 'THU', 'a1');
    const tuesday = await board(beto.cookie);
    expect(tuesday.today).toEqual({ date: '2026-10-20', weekday: 'TUE' });
    const stateOf = (snapshot: BoardResponse, id: string) => {
      const card = snapshot.cards.find((row) => row.id === id);
      if (!card) throw new Error(`card ${id} is not on the board`);
      return cardVisualState(card, snapshot.sprint, snapshot.today);
    };
    expect(stateOf(tuesday, api1)).toEqual({ pendingValidation: false, due: 'TODAY' });
    expect(stateOf(tuesday, login)).toEqual({ pendingValidation: false, due: 'OVERDUE' });
    expect(stateOf(tuesday, estilos)).toEqual({ pendingValidation: true, due: null });
    expect(stateOf(tuesday, tablero)).toEqual({ pendingValidation: false, due: null });

    // Wednesday and Thursday (Ejecución): validated cards start and finish.
    time.now = WEDNESDAY;
    await advance(beto, login, 'DOING');
    await advance(carla, tablero, 'DOING');
    expect(stateOf(await board(), tablero).due).toBe('TODAY');
    time.now = THURSDAY;
    const finished = await advance(beto, login, 'DONE');
    expect(finished.completedAt).toBe(THURSDAY.toISOString());
    const thursday = await board();
    expect(stateOf(thursday, login).due).toBeNull();
    expect(stateOf(thursday, tablero).due).toBe('OVERDUE');

    // Friday (Cierre): unfinished cards go back to the Backlog with their assignee; the DONE card leaves the board.
    time.now = FRIDAY;
    const closed = await request(app).post(api(`/sprints/${sprint1.body.id}/close`)).set('Cookie', ana.cookie).send();
    expect(closed.status).toBe(200);
    expect(closed.body.sprint.status).toBe('CLOSED');
    expect([...closed.body.returnedCardIds].sort()).toEqual([api1, estilos, tablero].sort());
    const friday = await board();
    expect(friday.sprint).toBeNull();
    expect(friday.cards.map((card) => card.id)).not.toContain(login);
    const back = (id: string) => friday.cards.find((card) => card.id === id);
    for (const [id, assigneeId] of [
      [api1, beto.id],
      [tablero, carla.id],
      [estilos, carla.id],
    ] as const) {
      expect(back(id)).toMatchObject({ status: 'BACKLOG', assigneeId, sprintId: null, validated: false });
      expect(back(id)?.validatedById).toBeNull();
    }

    // Next Monday: sessions are a week old, so everyone signs in again; sprint 2 covers the new week.
    time.now = NEXT_MONDAY;
    teacherCookie = await cookieFor(teacher.id);
    ana.cookie = await cookieFor(ana.id);
    expect((await board()).today).toEqual({ date: '2026-10-26', weekday: 'MON' });
    const sprint2 = await startSprint('Pulir el tablero');
    expect(sprint2.status).toBe(201);
    expect(sprint2.body).toMatchObject({ number: 2, startDate: '2026-10-26', endDate: '2026-10-30', status: 'OPEN' });
  });
});
