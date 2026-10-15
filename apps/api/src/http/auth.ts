import type { SessionUser } from '@kanbit/shared';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from '../lib/clock';
import { AppError } from './errors';

declare global {
  // Express merges its Request interface through this global namespace.
  namespace Express {
    interface Request {
      /** Set by `requireAuth` once the session cookie is verified and the user still exists. */
      user?: SessionUser;
    }
  }
}

export const SESSION_COOKIE = 'kanbit_session';
/** v1.0: one 7-day session JWT, no refresh token (spec §12.1). */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const JWT_ALGORITHM = 'HS256';

export interface AuthConfig {
  jwtSecret: string;
  /** `.kanbit.app` in production; undefined means a host-only cookie. */
  cookieDomain?: string;
  secureCookies: boolean;
}

const secretKey = (config: AuthConfig) => new TextEncoder().encode(config.jwtSecret);

export async function signSessionToken(userId: string, config: AuthConfig, clock: Clock): Promise<string> {
  const issuedAt = Math.floor(clock.now().getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(secretKey(config));
}

/** Returns the user id for a valid, unexpired token, or null for anything else. */
export async function verifySessionToken(token: string, config: AuthConfig, clock: Clock): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config), {
      algorithms: [JWT_ALGORITHM],
      currentDate: clock.now(),
      requiredClaims: ['sub', 'exp'],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function baseCookieOptions(config: AuthConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

export function setSessionCookie(res: Response, token: string, config: AuthConfig): void {
  res.cookie(SESSION_COOKIE, token, { ...baseCookieOptions(config), maxAge: SESSION_TTL_SECONDS * 1000 });
}

/** Attributes must match the ones used to set it or browsers keep the cookie. */
export function clearSessionCookie(res: Response, config: AuthConfig): void {
  res.clearCookie(SESSION_COOKIE, baseCookieOptions(config));
}

export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required');

export interface RequireAuthDeps {
  config: AuthConfig;
  clock: Clock;
  loadUser: (id: string) => Promise<SessionUser | null>;
}

/** Verifies the session cookie and loads the user on every request (stateless JWT, fresh role). */
export function createRequireAuth({ config, clock, loadUser }: RequireAuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') throw unauthenticated();

    const userId = await verifySessionToken(token, config, clock);
    const user = userId ? await loadUser(userId) : null;
    if (!user) throw unauthenticated();

    req.user = user;
    next();
  };
}

/** The authenticated user; only call behind `requireAuth`. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
