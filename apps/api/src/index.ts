import 'dotenv/config';
import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app';
import { loadEnv } from './config/env';
import { systemClock } from './lib/clock';
import { createLogger } from './lib/logger';
import { createPrismaClient, pingDatabase } from './lib/prisma';

const env = loadEnv();
const logger = createLogger(env.NODE_ENV === 'production' ? 'info' : 'debug');
const prisma = createPrismaClient(env.DATABASE_URL);

const app = createApp({
  pingDb: () => pingDatabase(prisma),
  clock: systemClock,
  corsOrigin: env.CORS_ORIGIN,
  version: pkg.version,
  logger,
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'kanbit api listening');
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((closeErr) => {
    prisma
      .$disconnect()
      .catch((err: unknown) => logger.error({ err }, 'prisma disconnect failed'))
      .finally(() => process.exit(closeErr ? 1 : 0));
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
