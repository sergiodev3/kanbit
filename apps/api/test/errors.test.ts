import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, errorHandler, notFoundHandler } from '../src/http/errors';

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.get('/boom', handler);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('error handler', () => {
  it('maps zod errors to 400 VALIDATION_ERROR with details', async () => {
    const res = await request(
      appWith(() => {
        z.object({ title: z.string() }).parse({});
      }),
    ).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('maps AppError to its status and code (async handlers included)', async () => {
    const res = await request(
      appWith(async () => {
        throw new AppError(409, 'CONFLICT', 'Stale update');
      }),
    ).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'Stale update' } });
  });

  it('hides unexpected errors behind 500 INTERNAL_ERROR', async () => {
    const res = await request(
      appWith(() => {
        throw new Error('secret db detail');
      }),
    ).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
