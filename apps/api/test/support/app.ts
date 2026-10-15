import { createApp, type AppDeps } from '../../src/app';
import type { AuthConfig } from '../../src/http/auth';
import { createClock } from '../../src/lib/clock';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createUsersService } from '../../src/modules/users/users.service';
import { MemoryDb } from './memory-db';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export interface TestAppOptions {
  pingDb?: AppDeps['pingDb'];
  auth?: Partial<AuthConfig>;
  rateLimit?: boolean;
  now?: Date;
}

/** Builds the real app with real services over an in-memory store and a controllable clock. */
export function buildTestApp(options: TestAppOptions = {}) {
  const db = new MemoryDb();
  const time = { now: options.now ?? new Date('2026-10-19T15:00:00Z') };
  const clock = createClock(() => time.now);

  const app = createApp({
    pingDb: options.pingDb ?? (async () => {}),
    clock,
    corsOrigin: 'http://localhost:5173',
    version: '9.9.9-test',
    logLevel: 'silent',
    auth: { jwtSecret: TEST_JWT_SECRET, secureCookies: false, ...options.auth },
    rateLimit: options.rateLimit ?? false,
    services: {
      auth: createAuthService({ repository: db.authRepository }),
      users: createUsersService({ repository: db.usersRepository }),
    },
  });

  return { app, db, clock, time };
}
