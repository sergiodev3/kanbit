import { type Role, normalizeUsername } from '@kanbit/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { hashPassword } from '../lib/password';
import { isUniqueViolation } from '../lib/prisma';

export interface SeedTeacherOptions {
  username: string;
  password: string;
  name?: string;
}

/** `conflict`: the username belongs to a non-teacher account, a misconfiguration; nothing was changed. */
export type SeedTeacherResult =
  | { outcome: 'created' | 'existing'; userId: string }
  | { outcome: 'conflict'; userId: string; role: Role };

export interface SeedTeacherStore {
  findByUsername(username: string): Promise<{ id: string; role: Role } | null>;
  createTeacher(data: { username: string; name: string; passwordHash: string }): Promise<{ id: string }>;
}

const DEFAULT_TEACHER_NAME = 'Docente';

/** Creates the initial teacher when missing; an existing account is never modified (spec §8.1). */
export async function seedTeacher(store: SeedTeacherStore, options: SeedTeacherOptions): Promise<SeedTeacherResult> {
  const username = normalizeUsername(options.username);
  const existing = await store.findByUsername(username);
  if (existing) {
    return existing.role === 'TEACHER'
      ? { outcome: 'existing', userId: existing.id }
      : { outcome: 'conflict', userId: existing.id, role: existing.role };
  }

  const created = await store.createTeacher({
    username,
    name: options.name?.trim() || DEFAULT_TEACHER_NAME,
    passwordHash: await hashPassword(options.password),
  });
  return { outcome: 'created', userId: created.id };
}

/** One message per outcome, shared by the boot path and `pnpm db:seed`. */
export function describeSeedTeacherResult(result: SeedTeacherResult): { level: 'info' | 'error'; message: string } {
  switch (result.outcome) {
    case 'created':
      return { level: 'info', message: 'seed teacher created' };
    case 'existing':
      return { level: 'info', message: 'seed teacher already exists; password left unchanged' };
    case 'conflict':
      return {
        level: 'error',
        message: `seed teacher misconfigured: SEED_TEACHER_USERNAME belongs to a ${result.role} account; nothing was changed`,
      };
  }
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
