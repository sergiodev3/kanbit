import 'dotenv/config';
import { loadEnv } from '../src/config/env';
import { createPrismaClient } from '../src/lib/prisma';
import { describeSeedTeacherResult, ensureSeedTeacher } from '../src/seed/teacher';

// `pnpm db:seed` (prisma db seed): same idempotent teacher seed the API runs at boot.
const env = loadEnv();
if (!env.SEED_TEACHER_USERNAME || !env.SEED_TEACHER_PASSWORD) {
  console.error('Set SEED_TEACHER_USERNAME and SEED_TEACHER_PASSWORD to seed the teacher.');
  process.exit(1);
}

const prisma = createPrismaClient(env.DATABASE_URL);
try {
  const result = await ensureSeedTeacher(prisma, {
    username: env.SEED_TEACHER_USERNAME,
    password: env.SEED_TEACHER_PASSWORD,
    name: env.SEED_TEACHER_NAME,
  });
  const { level, message } = describeSeedTeacherResult(result);
  if (level === 'error') {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.log(message);
  }
} finally {
  await prisma.$disconnect();
}
