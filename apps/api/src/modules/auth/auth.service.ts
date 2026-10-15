import type {
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  Membership,
  RegisterRequest,
  SessionUser,
} from '@kanbit/shared';
import { unauthenticated } from '../../http/auth';
import { AppError } from '../../http/errors';
import { hashPassword as defaultHash, verifyPassword as defaultVerify } from '../../lib/password';

export interface UserRecord extends SessionUser {
  passwordHash: string;
}

export interface NewStudent {
  name: string;
  username: string;
  passwordHash: string;
  groupId: string;
}

/** Persistence port for the auth rules; the Prisma adapter lives in `auth.repository.ts`. */
export interface AuthRepository {
  transaction<T>(fn: (repository: AuthRepository) => Promise<T>): Promise<T>;
  findGroupByAccessCode(accessCode: string): Promise<{ id: string; accessOpen: boolean } | null>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  /** Creates the STUDENT user and its GroupMember atomically; null when the username is taken. */
  createStudent(data: NewStudent): Promise<UserRecord | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
  listMemberships(userId: string): Promise<Membership[]>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface AuthService {
  register(input: RegisterRequest): Promise<SessionUser>;
  login(input: LoginRequest): Promise<SessionUser>;
  findSessionUser(id: string): Promise<SessionUser | null>;
  getMe(user: SessionUser): Promise<MeResponse>;
  changePassword(userId: string, input: ChangePasswordRequest): Promise<void>;
}

export interface AuthServiceDeps {
  repository: AuthRepository;
  passwords?: PasswordHasher;
}

const toSessionUser = ({ id, name, username, role }: UserRecord): SessionUser => ({ id, name, username, role });

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
const usernameTaken = () => new AppError(409, 'USERNAME_TAKEN', 'Username is already taken');

export function createAuthService({
  repository,
  passwords = { hash: defaultHash, verify: defaultVerify },
}: AuthServiceDeps): AuthService {
  // Verified against when the username does not exist so both failures take similar time.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () => (dummyHash ??= passwords.hash('kanbit-timing-equaliser'));

  return {
    async register(input) {
      const passwordHash = await passwords.hash(input.password);

      const user = await repository.transaction(async (tx) => {
        const group = await tx.findGroupByAccessCode(input.accessCode);
        if (!group) throw new AppError(404, 'INVALID_ACCESS_CODE', 'Unknown group access code');
        if (!group.accessOpen) throw new AppError(403, 'REGISTRATION_CLOSED', 'Registration is closed for this group');
        if (await tx.findUserByUsername(input.username)) throw usernameTaken();

        const created = await tx.createStudent({
          name: input.name,
          username: input.username,
          passwordHash,
          groupId: group.id,
        });
        if (!created) throw usernameTaken();
        return created;
      });

      return toSessionUser(user);
    },

    async login({ username, password }) {
      const user = await repository.findUserByUsername(username);
      if (!user) {
        await passwords.verify(await getDummyHash(), password);
        throw invalidCredentials();
      }
      if (!(await passwords.verify(user.passwordHash, password))) throw invalidCredentials();
      return toSessionUser(user);
    },

    async findSessionUser(id) {
      const user = await repository.findUserById(id);
      return user ? toSessionUser(user) : null;
    },

    async getMe(user) {
      return { user, memberships: await repository.listMemberships(user.id) };
    },

    async changePassword(userId, { currentPassword, newPassword }) {
      const user = await repository.findUserById(userId);
      if (!user) throw unauthenticated();
      if (!(await passwords.verify(user.passwordHash, currentPassword))) {
        throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect');
      }
      await repository.updatePasswordHash(userId, await passwords.hash(newPassword));
    },
  };
}
