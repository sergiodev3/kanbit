import { describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/lib/password';
import { type SeedTeacherStore, seedTeacher } from '../src/seed/teacher';

function memoryStore() {
  const users: { id: string; username: string; name: string; role: 'TEACHER' | 'STUDENT'; passwordHash: string }[] = [];
  const store: SeedTeacherStore = {
    findByUsername: async (username) => users.find((user) => user.username === username) ?? null,
    createTeacher: async (data) => {
      const user = { id: `u${users.length + 1}`, role: 'TEACHER' as const, ...data };
      users.push(user);
      return user;
    },
  };
  return { users, store };
}

describe('seedTeacher', () => {
  it('creates the teacher with a normalised username and a hashed password', async () => {
    const { users, store } = memoryStore();

    const result = await seedTeacher(store, { username: '  Maestra ', password: 'teacher-pass' });

    expect(result).toMatchObject({ created: true, role: 'TEACHER' });
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: 'maestra', name: 'Docente', role: 'TEACHER' });
    expect(await verifyPassword(users[0]?.passwordHash ?? '', 'teacher-pass')).toBe(true);
  });

  it('is idempotent and never overwrites an existing password', async () => {
    const { users, store } = memoryStore();
    await seedTeacher(store, { username: 'maestra', password: 'first-pass', name: 'Maestra Ruiz' });
    const originalHash = users[0]?.passwordHash;

    const again = await seedTeacher(store, { username: 'MAESTRA', password: 'second-pass' });

    expect(again).toMatchObject({ created: false, role: 'TEACHER' });
    expect(users).toHaveLength(1);
    expect(users[0]?.passwordHash).toBe(originalHash);
    expect(users[0]?.name).toBe('Maestra Ruiz');
  });
});
