import { normalizeUsername } from '@kanbit/shared';
import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from './errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_USERNAME = 10;
/** A whole classroom can share one school NAT IP, so this cap is far above a single user's. */
const MAX_GUESSES_PER_IP = 50;
/** Wrong password (401), closed registration (403) and unknown access code (404): the responses that reveal a guess. */
const GUESS_STATUSES = new Set([401, 403, 404]);

function usernameOf(req: Request): string {
  const body: unknown = req.body;
  return typeof body === 'object' && body !== null && 'username' in body && typeof body.username === 'string'
    ? normalizeUsername(body.username)
    : '';
}

function failureLimiter(
  limit: number,
  keyGenerator: (req: Request) => string,
  counts: (status: number) => boolean,
): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req, res) => !counts(res.statusCode),
    keyGenerator,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again later')),
  });
}

/**
 * Builds the limiters for ONE route; each call has its own in-memory stores, so the budgets below are per route.
 * Per 15 min:
 * - 10 failed attempts (any status >= 400) per IP + username (spec §13.2), so classmates behind one school IP
 *   do not lock each other out;
 * - 50 guesses (401/403/404) per IP, so rotating usernames from one IP cannot bypass the first limit. Validation
 *   errors, taken usernames and 429s do not count, so a class registering together does not drain it.
 */
export function createAuthRateLimiter(enabled: boolean): RequestHandler[] {
  if (!enabled) return [];

  const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? '');
  return [
    failureLimiter(MAX_GUESSES_PER_IP, ipKey, (status) => GUESS_STATUSES.has(status)),
    failureLimiter(MAX_ATTEMPTS_PER_USERNAME, (req) => `${ipKey(req)}|${usernameOf(req)}`, (status) => status >= 400),
  ];
}
