import 'dotenv/config';
import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app';
import { loadEnv } from './config/env';
import { systemClock } from './lib/clock';
import { createLogger } from './lib/logger';
import { createPrismaClient, pingDatabase } from './lib/prisma';
import { ensureSeedTeacher } from './seed/teacher';

const env = loadEnv();
const logger = createLogger(env.NODE_ENV === 'production' ? 'info' : 'debug');
const prisma = createPrismaClient(env.DATABASE_URL);

if (env.SEED_TEACHER_USERNAME && env.SEED_TEACHER_PASSWORD) {
  try {
    const seed = await ensureSeedTeacher(prisma, {
      username: env.SEED_TEACHER_USERNAME,
      password: env.SEED_TEACHER_PASSWORD,
      name: env.SEED_TEACHER_NAME,
    });
    if (seed.role !== 'TEACHER') logger.warn('seed teacher username belongs to a student; skipped');
    else logger.info({ created: seed.created }, 'seed teacher ensured');
  } catch (err) {
    // Keep booting: /health reports the database problem.
    logger.error({ err }, 'seed teacher failed');
  }
} else if (env.SEED_TEACHER_USERNAME || env.SEED_TEACHER_PASSWORD) {
  logger.warn('set both SEED_TEACHER_USERNAME and SEED_TEACHER_PASSWORD to seed the teacher');
}

const app = createApp({
  pingDb: () => pingDatabase(prisma),
  clock: systemClock,
  corsOrigin: env.CORS_ORIGIN,
  version: pkg.version,
  auth: {
    jwtSecret: env.JWT_SECRET,
    cookieDomain: env.COOKIE_DOMAIN,
    secureCookies: env.NODE_ENV === 'production',
  },
  prisma,
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
