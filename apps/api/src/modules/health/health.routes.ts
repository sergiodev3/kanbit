import type { HealthResponse } from '@kanbit/shared';
import { Router } from 'express';
import type { Clock } from '../../lib/clock';

export interface HealthDeps {
  pingDb: () => Promise<void>;
  clock: Clock;
  version: string;
  /** Max time to wait for the database before reporting it down. */
  pingTimeoutMs?: number;
}

async function isDbUp(pingDb: () => Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('db ping timeout')), timeoutMs);
  });
  try {
    await Promise.race([pingDb(), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRouter({ pingDb, clock, version, pingTimeoutMs = 2000 }: HealthDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const dbUp = await isDbUp(pingDb, pingTimeoutMs);
    const payload: HealthResponse = {
      status: dbUp ? 'ok' : 'error',
      db: dbUp ? 'ok' : 'down',
      version,
      time: clock.now().toISOString(),
    };
    res.status(dbUp ? 200 : 503).set('Cache-Control', 'no-store').json(payload);
  });

  return router;
}
