import { normalizeUsername } from '@kanbit/shared';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from './errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function usernameOf(req: Request): string {
  const body: unknown = req.body;
  return typeof body === 'object' && body !== null && 'username' in body && typeof body.username === 'string'
    ? normalizeUsername(body.username)
    : '';
}

/**
 * 10 failed attempts per 15 min per IP + username (spec §13.2). Keying on the username too
 * keeps a whole classroom behind one school IP from locking itself out.
 */
export function createAuthRateLimiter(enabled: boolean): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();

  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_ATTEMPTS,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${usernameOf(req)}`,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later')),
  });
}
