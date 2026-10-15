import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from '../src/app';
import { createClock } from '../src/lib/clock';

const fixedNow = new Date('2026-10-19T15:00:00Z');

function buildApp(pingDb: AppDeps['pingDb']) {
  return createApp({
    pingDb,
    clock: createClock(() => fixedNow),
    corsOrigin: 'http://localhost:5173',
    version: '9.9.9-test',
    logLevel: 'silent',
  });
}

describe('GET /api/v1/health', () => {
  it('returns 200 with db ok when the ping succeeds', async () => {
    const res = await request(buildApp(async () => {})).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      db: 'ok',
      version: '9.9.9-test',
      time: fixedNow.toISOString(),
    });
  });

  it('returns 503 with db down when the ping fails', async () => {
    const res = await request(
      buildApp(async () => {
        throw new Error('connection refused');
      }),
    ).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', db: 'down', version: '9.9.9-test' });
  });

  it('sends CORS headers with credentials for the configured origin', async () => {
    const res = await request(buildApp(async () => {}))
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('error shape', () => {
  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await request(buildApp(async () => {})).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('returns 400 INVALID_JSON for malformed bodies', async () => {
    const res = await request(buildApp(async () => {}))
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
