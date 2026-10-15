import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Read lazily from process.env (not `env()`, which throws when unset) so
    // `prisma generate` and `prisma validate` work without a database.
    // Commands that connect (migrate dev/deploy) still need DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
