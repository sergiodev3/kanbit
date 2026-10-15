import type { ResetPasswordResponse } from '@kanbit/shared';
import { AppError } from '../../http/errors';
import { generateTemporaryPassword, hashPassword } from '../../lib/password';

/** Persistence port for user administration; the Prisma adapter lives in `users.repository.ts`. */
export interface UsersRepository {
  /** The student, only when they belong to a group taught by `teacherId`. */
  findStudentTaughtBy(teacherId: string, studentId: string): Promise<{ id: string } | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

export interface UsersService {
  resetPassword(teacherId: string, studentId: string): Promise<ResetPasswordResponse>;
}

export interface UsersServiceDeps {
  repository: UsersRepository;
  hash?: (password: string) => Promise<string>;
  generatePassword?: () => string;
}

export function createUsersService({
  repository,
  hash = hashPassword,
  generatePassword = generateTemporaryPassword,
}: UsersServiceDeps): UsersService {
  return {
    async resetPassword(teacherId, studentId) {
      // Students outside the teacher's groups look missing so ids cannot be probed.
      const student = await repository.findStudentTaughtBy(teacherId, studentId);
      if (!student) throw new AppError(404, 'USER_NOT_FOUND', 'Student not found');

      const temporaryPassword = generatePassword();
      await repository.updatePasswordHash(student.id, await hash(temporaryPassword));
      return { temporaryPassword };
    },
  };
}
