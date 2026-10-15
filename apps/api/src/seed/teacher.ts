import { type Role, normalizeUsername } from '@kanbit/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../lib/password';
import { isUniqueViolation } from '../lib/prisma';

export interface SeedTeacherOptions {
  username: string;
  password: string;
  name?: string;
}

export interface SeedTeacherResult {
  created: boolean;
  userId: string;
  /** Role of the account holding the username; a STUDENT here means the seed was skipped. */
  role: Role;
}

export interface SeedTeacherStore {
  findByUsername(username: string): Promise<{ id: string; role: Role } | null>;
  createTeacher(data: { username: string; name: string; passwordHash: string }): Promise<{ id: string }>;
}

const DEFAULT_TEACHER_NAME = 'Docente';

/** Creates the initial teacher when missing; an existing account is never modified (spec §8.1). */
export async function seedTeacher(store: SeedTeacherStore, options: SeedTeacherOptions): Promise<SeedTeacherResult> {
  const username = normalizeUsername(options.username);
  const existing = await store.findByUsername(username);
  if (existing) return { created: false, userId: existing.id, role: existing.role };

  const created = await store.createTeacher({
    username,
    name: options.name?.trim() || DEFAULT_TEACHER_NAME,
    passwordHash: await hashPassword(options.password),
  });
  return { created: true, userId: created.id, role: 'TEACHER' };
}

function prismaSeedStore(prisma: PrismaClient): SeedTeacherStore {
  return {
    findByUsername: (username) => prisma.user.findUnique({ where: { username }, select: { id: true, role: true } }),
    createTeacher: (data) => prisma.user.create({ data: { ...data, role: 'TEACHER' }, select: { id: true } }),
  };
}

/** Idempotent; safe to run on every boot and from `pnpm db:seed`, even concurrently. */
export async function ensureSeedTeacher(prisma: PrismaClient, options: SeedTeacherOptions): Promise<SeedTeacherResult> {
  try {
    return await seedTeacher(prismaSeedStore(prisma), options);
  } catch (err) {
    // Another instance created it between our lookup and insert.
    if (isUniqueViolation(err)) return seedTeacher(prismaSeedStore(prisma), options);
    throw err;
  }
}
