import { createApp, type AppDeps } from '../../src/app';
import { type AuthConfig, SESSION_COOKIE, signSessionToken } from '../../src/http/auth';
import { createClock } from '../../src/lib/clock';
import { createAuthService } from '../../src/modules/auth/auth.service';
import { createCardsService } from '../../src/modules/cards/cards.service';
import { createGroupsService } from '../../src/modules/groups/groups.service';
import { createProjectsService } from '../../src/modules/projects/projects.service';
import { createSprintsService } from '../../src/modules/sprints/sprints.service';
import { createTeamsService } from '../../src/modules/teams/teams.service';
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
  const time = { now: options.now ?? new Date('2026-10-19T15:00:00Z') };
  const db = new MemoryDb(() => time.now);
  const clock = createClock(() => time.now);
  const auth: AuthConfig = { jwtSecret: TEST_JWT_SECRET, secureCookies: false, ...options.auth };

  const app = createApp({
    pingDb: options.pingDb ?? (async () => {}),
    clock,
    corsOrigin: 'http://localhost:5173',
    version: '9.9.9-test',
    logLevel: 'silent',
    auth,
    rateLimit: options.rateLimit ?? false,
    services: {
      auth: createAuthService({ repository: db.authRepository }),
      users: createUsersService({ repository: db.usersRepository }),
      groups: createGroupsService({ repository: db.groupsRepository }),
      teams: createTeamsService({ repository: db.teamsRepository }),
      projects: createProjectsService({ repository: db.projectsRepository }),
      cards: createCardsService({ repository: db.cardsRepository, clock }),
      sprints: createSprintsService({ repository: db.sprintsRepository, clock }),
    },
  });

  /** A valid session cookie header for `userId`, skipping the (slow) password login. */
  const cookieFor = async (userId: string) => `${SESSION_COOKIE}=${await signSessionToken(userId, auth, clock)}`;

  return { app, db, clock, time, cookieFor };
}
