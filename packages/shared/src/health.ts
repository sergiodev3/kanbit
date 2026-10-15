import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'down']),
  version: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
