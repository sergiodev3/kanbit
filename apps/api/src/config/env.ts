import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // v1.0: one 7-day session JWT in an HttpOnly cookie (no refresh token yet).
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Empty in development (host-only cookie); `.kanbit.app` in production.
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  CORS_ORIGIN: z.url(),
  SEED_TEACHER_USERNAME: z.string().min(1).optional(),
  SEED_TEACHER_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses and validates environment variables; exits early with a readable message. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
