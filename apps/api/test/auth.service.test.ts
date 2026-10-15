import { describe, expect, it, vi } from 'vitest';
import { type PasswordHasher, createAuthService } from '../src/modules/auth/auth.service';
import { MemoryDb } from './support/memory-db';

function setup() {
  const db = new MemoryDb();
  const teacher = db.addUser({ username: 'maestra', role: 'TEACHER', passwordHash: 'teacher-hash' });
  const group = db.addGroup({ name: '5A Programacion', accessCode: 'AB12CD', teacherId: teacher.id });
  db.addUser({ username: 'a0001', role: 'STUDENT', passwordHash: 'student-hash' });
  const hash = vi.fn<PasswordHasher['hash']>(async (password) => `hashed:${password}`);
  const verify = vi.fn<PasswordHasher['verify']>(async () => false);
  const service = createAuthService({ repository: db.authRepository, passwords: { hash, verify } });
  return { db, group, hash, service };
}

const input = { accessCode: 'AB12CD', name: 'Beto', username: 'a0002', password: 'beto-pass-1' };

describe('authService.register', () => {
  it('never hashes the password for an unknown access code', async () => {
    const { service, hash } = setup();

    await expect(service.register({ ...input, accessCode: 'ZZZZZZ' })).rejects.toMatchObject({
      status: 404,
      code: 'INVALID_ACCESS_CODE',
    });
    expect(hash).not.toHaveBeenCalled();
  });

  it('never hashes the password when the group closed registration', async () => {
    const { service, group, hash } = setup();
    group.accessOpen = false;

    await expect(service.register(input)).rejects.toMatchObject({ status: 403, code: 'REGISTRATION_CLOSED' });
    expect(hash).not.toHaveBeenCalled();
  });

  it('never hashes the password when the username is taken', async () => {
    const { service, hash } = setup();

    await expect(service.register({ ...input, username: 'a0001' })).rejects.toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
    });
    expect(hash).not.toHaveBeenCalled();
  });

  it('hashes once and stores the hash when every check passes', async () => {
    const { service, db, hash } = setup();

    const user = await service.register(input);

    expect(user).toMatchObject({ username: 'a0002', role: 'STUDENT' });
    expect(hash).toHaveBeenCalledTimes(1);
    expect(db.users.find((row) => row.username === 'a0002')?.passwordHash).toBe('hashed:beto-pass-1');
  });
});
