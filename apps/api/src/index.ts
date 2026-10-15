import 'dotenv/config';
import pkg from '../package.json' with { type: 'json' };
import { createApp } from './app';
import { loadEnv } from './config/env';
import { systemClock } from './lib/clock';
import { createLogger } from './lib/logger';
import { createPrismaClient, pingDatabase } from './lib/prisma';
import { describeSeedTeacherResult, ensureSeedTeacher } from './seed/teacher';

const env = loadEnv();
const logger = createLogger(env.NODE_ENV === 'production' ? 'info' : 'debug');
const prisma = createPrismaClient(env.DATABASE_URL);

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

/** Runs after `listen` and never throws: /health stays up even if the database hangs or the seed fails. */
async function seedTeacherInBackground(): Promise<void> {
  if (!env.SEED_TEACHER_USERNAME || !env.SEED_TEACHER_PASSWORD) {
    if (env.SEED_TEACHER_USERNAME || env.SEED_TEACHER_PASSWORD) {
      logger.warn('set both SEED_TEACHER_USERNAME and SEED_TEACHER_PASSWORD to seed the teacher');
    }
    return;
  }
  try {
    const result = await ensureSeedTeacher(prisma, {
      username: env.SEED_TEACHER_USERNAME,
      password: env.SEED_TEACHER_PASSWORD,
      name: env.SEED_TEACHER_NAME,
    });
    const { level, message } = describeSeedTeacherResult(result);
    logger[level]({ outcome: result.outcome }, message);
  } catch (err) {
    // Keep running: /health reports the database problem.
    logger.error({ err }, 'seed teacher failed');
  }
}

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'kanbit api listening');
  void seedTeacherInBackground();
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
