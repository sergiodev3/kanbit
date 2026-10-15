import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/password';
import { buildTestApp } from './support/app';

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

/** Extracts the `name=value` pair of the session cookie from a response. */
function sessionCookie(res: request.Response): string {
  const header = setCookieFor(res);
  return header.split(';')[0] ?? '';
}

function setCookieFor(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const found = cookies.find((cookie) => cookie.startsWith('kanbit_session='));
  if (!found) throw new Error('kanbit_session cookie not set');
  return found;
}

async function setup(options: Parameters<typeof buildTestApp>[0] = {}) {
  const ctx = buildTestApp(options);
  const teacher = ctx.db.addUser({
    username: 'maestra',
    name: 'Maestra Ruiz',
    role: 'TEACHER',
    passwordHash: await hashPassword('teacher-pass'),
  });
  const group = ctx.db.addGroup({ name: '5A Programacion', accessCode: 'AB12CD', teacherId: teacher.id });
  const student = ctx.db.addUser({
    username: 'a0001',
    name: 'Ana',
    role: 'STUDENT',
    passwordHash: await hashPassword('student-pass'),
  });
  ctx.db.groupMembers.push({ groupId: group.id, userId: student.id });

  const login = async (username: string, password: string) =>
    request(ctx.app).post('/api/v1/auth/login').send({ username, password });

  return { ...ctx, teacher, group, student, login };
}

describe('POST /auth/login', () => {
  it('returns the session user and sets an HttpOnly, SameSite=Lax, 7-day cookie', async () => {
    const { login, student } = await setup();

    const res = await login('a0001', 'student-pass');

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: student.id, name: 'Ana', username: 'a0001', role: 'STUDENT' });
    const cookie = setCookieFor(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(new RegExp(`Max-Age=${SEVEN_DAYS_S}`));
    expect(cookie).not.toMatch(/Secure/);
    expect(cookie).not.toMatch(/Domain=/);
  });

  it('adds Secure and Domain in production-like config', async () => {
    const { login } = await setup({ auth: { secureCookies: true, cookieDomain: '.kanbit.app' } });

    const cookie = setCookieFor(await login('a0001', 'student-pass'));

    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Domain=\.kanbit\.app/);
  });

  it('accepts the username case-insensitively', async () => {
    const { login } = await setup();

    expect((await login('  A0001 ', 'student-pass')).status).toBe(200);
  });

  it('answers wrong password and unknown user with the same generic 401', async () => {
    const { login } = await setup();

    const wrongPassword = await login('a0001', 'nope-nope');
    const unknownUser = await login('ghost', 'student-pass');

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownUser.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a missing password with 400 VALIDATION_ERROR', async () => {
    const { app } = await setup();

    const res = await request(app).post('/api/v1/auth/login').send({ username: 'a0001' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rate-limits repeated failures for the same username when enabled', async () => {
    const { login } = await setup({ rateLimit: true });

    for (let i = 0; i < 10; i++) {
      expect((await login('a0001', 'wrong-pass')).status).toBe(401);
    }
    const limited = await login('a0001', 'wrong-pass');

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    // Classmates behind the same school IP are not locked out.
    expect((await login('maestra', 'teacher-pass')).status).toBe(200);
  });
});

describe('GET /auth/me', () => {
  it('returns 401 UNAUTHENTICATED without a cookie', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 for a tampered token', async () => {
    const { app, login } = await setup();
    const cookie = sessionCookie(await login('a0001', 'student-pass'));
    const tampered = `${cookie.slice(0, -2)}${cookie.endsWith('A') ? 'B' : 'A'}x`;

    const res = await request(app).get('/api/v1/auth/me').set('Cookie', tampered);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('accepts the token for 7 days and rejects it once expired', async () => {
    const { app, login, time } = await setup();
    const cookie = sessionCookie(await login('a0001', 'student-pass'));
    const issuedAt = time.now.getTime();

    time.now = new Date(issuedAt + (SEVEN_DAYS_S - 60) * 1000);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);

    time.now = new Date(issuedAt + (SEVEN_DAYS_S + 1) * 1000);
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 when the user no longer exists', async () => {
    const { app, login, db, student } = await setup();
    const cookie = sessionCookie(await login('a0001', 'student-pass'));
    db.removeUser(student.id);

    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('returns the user with group and team memberships', async () => {
    const { app, login, db, group, student } = await setup();
    db.teamMembers.push({ teamId: 'team1', teamName: 'Los Bits', groupId: group.id, userId: student.id, isModerator: true });
    const cookie = sessionCookie(await login('a0001', 'student-pass'));

    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      user: { id: student.id, name: 'Ana', username: 'a0001', role: 'STUDENT' },
      memberships: [
        { groupId: group.id, groupName: '5A Programacion', teamId: 'team1', teamName: 'Los Bits', isModerator: true },
      ],
    });
  });
});

describe('POST /auth/logout', () => {
  it('clears the session cookie with the same attributes', async () => {
    const { app } = await setup({ auth: { cookieDomain: '.kanbit.app' } });

    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(204);
    const cookie = setCookieFor(res);
    expect(cookie).toMatch(/^kanbit_session=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cookie).toMatch(/Domain=\.kanbit\.app/);
  });
});

describe('POST /auth/register', () => {
  const body = { accessCode: 'ab12cd', name: 'Beto', username: 'A0002', password: 'beto-pass-1' };

  it('creates a student in the group, logs them in and returns memberships without team', async () => {
    const { app, group } = await setup();

    const res = await request(app).post('/api/v1/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Beto', username: 'a0002', role: 'STUDENT' });
    expect(res.body.memberships).toEqual([
      { groupId: group.id, groupName: '5A Programacion', teamId: null, teamName: null, isModerator: false },
    ]);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', sessionCookie(res));
    expect(me.body.user.username).toBe('a0002');
  });

  it('returns 404 INVALID_ACCESS_CODE for an unknown code', async () => {
    const { app } = await setup();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, accessCode: 'ZZZZZZ' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVALID_ACCESS_CODE');
  });

  it('returns 403 REGISTRATION_CLOSED when the group closed registration', async () => {
    const { app, group } = await setup();
    group.accessOpen = false;

    const res = await request(app).post('/api/v1/auth/register').send(body);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
  });

  it('returns 409 USERNAME_TAKEN for an existing username in any case', async () => {
    const { app } = await setup();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, username: 'A0001' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('returns 400 VALIDATION_ERROR for a short password', async () => {
    const { app } = await setup();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...body, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/change-password', () => {
  it('requires a session', async () => {
    const { app } = await setup();

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'student-pass', newPassword: 'brand-new-pass' });

    expect(res.status).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const { app, login } = await setup();
    const cookie = sessionCookie(await login('a0001', 'student-pass'));

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'not-mine', newPassword: 'brand-new-pass' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('changes the password so only the new one logs in', async () => {
    const { app, login } = await setup();
    const cookie = sessionCookie(await login('a0001', 'student-pass'));

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'student-pass', newPassword: 'brand-new-pass' });

    expect(res.status).toBe(204);
    expect((await login('a0001', 'student-pass')).status).toBe(401);
    expect((await login('a0001', 'brand-new-pass')).status).toBe(200);
  });
});

describe('POST /users/:id/reset-password', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('returns 401 without a session', async () => {
    const res = await request(ctx.app).post(`/api/v1/users/${ctx.student.id}/reset-password`);

    expect(res.status).toBe(401);
  });

  it('returns 403 FORBIDDEN when a student calls it', async () => {
    const cookie = sessionCookie(await ctx.login('a0001', 'student-pass'));

    const res = await request(ctx.app).post(`/api/v1/users/${ctx.student.id}/reset-password`).set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets the teacher of the group set a temporary password shown once', async () => {
    const cookie = sessionCookie(await ctx.login('maestra', 'teacher-pass'));

    const res = await request(ctx.app).post(`/api/v1/users/${ctx.student.id}/reset-password`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { temporaryPassword } = res.body as { temporaryPassword: string };
    expect(temporaryPassword).toMatch(/^\w{4}-\w{4}-\w{4}$/);
    expect((await ctx.login('a0001', 'student-pass')).status).toBe(401);
    expect((await ctx.login('a0001', temporaryPassword)).status).toBe(200);
  });

  it('returns 404 USER_NOT_FOUND for a student outside the teacher groups', async () => {
    const other = ctx.db.addUser({ username: 'otro', role: 'STUDENT', passwordHash: 'x' });
    const cookie = sessionCookie(await ctx.login('maestra', 'teacher-pass'));

    const res = await request(ctx.app).post(`/api/v1/users/${other.id}/reset-password`).set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});
