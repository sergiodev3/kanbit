import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { LevelWithSilent } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './http/errors';
import type { Clock } from './lib/clock';
import { createLogger, type Logger } from './lib/logger';
import { createHealthRouter } from './modules/health/health.routes';

export interface AppDeps {
  pingDb: () => Promise<void>;
  clock: Clock;
  corsOrigin: string;
  version: string;
  logger?: Logger;
  logLevel?: LevelWithSilent;
}

/** Builds the Express app without side effects so tests can inject fakes. */
export function createApp(deps: AppDeps): Express {
  const logger = deps.logger ?? createLogger(deps.logLevel);
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
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
