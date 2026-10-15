import { normalizeUsername } from '@kanbit/shared';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from './errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_USERNAME = 10;
/** A whole classroom can share one school NAT IP, so this cap is far above a single user's. */
const MAX_FAILURES_PER_IP = 50;

function usernameOf(req: Request): string {
  const body: unknown = req.body;
  return typeof body === 'object' && body !== null && 'username' in body && typeof body.username === 'string'
    ? normalizeUsername(body.username)
    : '';
}

function failureLimiter(limit: number, keyGenerator: (req: Request) => string): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later')),
  });
}

/**
 * Failed attempts only (successful requests are not counted), per 15 min:
 * - 10 per IP + username (spec §13.2), so classmates behind one school IP do not lock each other out;
 * - 50 per IP, so rotating usernames from one IP cannot bypass the first limit.
 */
export function createAuthRateLimiter(enabled: boolean): RequestHandler[] {
  if (!enabled) return [];

  const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? '');
  return [
    failureLimiter(MAX_FAILURES_PER_IP, ipKey),
    failureLimiter(MAX_ATTEMPTS_PER_USERNAME, (req) => `${ipKey(req)}|${usernameOf(req)}`),
  ];
}
