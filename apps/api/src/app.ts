import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { LevelWithSilent } from 'pino';
import { pinoHttp } from 'pino-http';
import type { PrismaClient } from './generated/prisma/client';
import { type AuthConfig, createRequireAuth } from './http/auth';
import { errorHandler, notFoundHandler } from './http/errors';
import type { Clock } from './lib/clock';
import { createLogger, type Logger } from './lib/logger';
import { createPrismaAuthRepository } from './modules/auth/auth.repository';
import { createAuthRouter } from './modules/auth/auth.routes';
import { type AuthService, createAuthService } from './modules/auth/auth.service';
import { createHealthRouter } from './modules/health/health.routes';
import { createPrismaUsersRepository } from './modules/users/users.repository';
import { createUsersRouter } from './modules/users/users.routes';
import { createUsersService, type UsersService } from './modules/users/users.service';

export interface AppServices {
  auth: AuthService;
  users: UsersService;
}

export interface AppDeps {
  pingDb: () => Promise<void>;
  clock: Clock;
  corsOrigin: string;
  version: string;
  auth: AuthConfig;
  /** Backs every service not overridden in `services`. Constructing the app never queries it. */
  prisma?: PrismaClient;
  /** Test seams: services given here replace the Prisma-backed ones. */
  services?: Partial<AppServices>;
  /** Login/register rate limiting; defaults to on. */
  rateLimit?: boolean;
  logger?: Logger;
  logLevel?: LevelWithSilent;
}

function resolveServices({ prisma, services = {} }: AppDeps): AppServices {
  const requirePrisma = (name: keyof AppServices): PrismaClient => {
    if (!prisma) throw new Error(`createApp: provide deps.prisma or deps.services.${name}`);
    return prisma;
  };
  return {
    auth: services.auth ?? createAuthService({ repository: createPrismaAuthRepository(requirePrisma('auth')) }),
    users: services.users ?? createUsersService({ repository: createPrismaUsersRepository(requirePrisma('users')) }),
  };
}

/** Builds the Express app without side effects so tests can inject fakes. */
export function createApp(deps: AppDeps): Express {
  const logger = deps.logger ?? createLogger(deps.logLevel);
  const services = resolveServices(deps);
  const requireAuth = createRequireAuth({
    config: deps.auth,
    clock: deps.clock,
    loadUser: (id) => services.auth.findSessionUser(id),
  });
  const rateLimit = deps.rateLimit ?? true;
  const app = express();

  // Railway terminates TLS one proxy hop away: needed for secure cookies and client IPs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger }));
  // kanbit.app and api.kanbit.app are same-site; relax CORP from helmet's same-origin default.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: deps.corsOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(createHealthRouter({ pingDb: deps.pingDb, clock: deps.clock, version: deps.version }));
  api.use(
    createAuthRouter({ service: services.auth, config: deps.auth, clock: deps.clock, requireAuth, rateLimit }),
  );
  api.use(createUsersRouter({ service: services.users, requireAuth }));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
