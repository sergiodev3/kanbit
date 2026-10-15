import { pino, type Logger, type LevelWithSilent } from 'pino';

export type { Logger };

export function createLogger(level: LevelWithSilent = 'info'): Logger {
  return pino({
    level,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  });
}
