import { PASSWORD_MIN_LENGTH } from '@kanbit/shared';
import { z } from 'zod';

/** `KEY=` in a .env file arrives as '' and means "unset". */
const optionalNonEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

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
  // Optional initial teacher, created at boot when missing (never overwritten).
  SEED_TEACHER_USERNAME: optionalNonEmpty(z.string().trim().min(1)),
  SEED_TEACHER_PASSWORD: optionalNonEmpty(z.string().min(PASSWORD_MIN_LENGTH)),
  SEED_TEACHER_NAME: optionalNonEmpty(z.string().trim().min(1)),
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
