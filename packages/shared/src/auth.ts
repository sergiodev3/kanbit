import { z } from 'zod';
import { Role } from './enums';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound keeps password hashing cheap enough to resist oversized-input abuse. */
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 80;
export const ACCESS_CODE_MAX_LENGTH = 16;

/** Usernames (student id / matricula or generated) are stored trimmed and lowercase. */
export const normalizeUsername = (value: string): string => value.trim().toLowerCase();

export const Username = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH)
      .max(USERNAME_MAX_LENGTH)
      .regex(/^[a-z0-9._-]+$/, 'Only letters, digits, dot, underscore and hyphen'),
  );

export const Password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const PersonName = z.string().trim().min(1).max(NAME_MAX_LENGTH);

/** Group access codes are case-insensitive for students and stored uppercase. */
export const AccessCode = z.string().trim().toUpperCase().min(1).max(ACCESS_CODE_MAX_LENGTH);

/** Login only normalises: registration rules are not re-checked so failures stay a generic 401. */
export const LoginRequest = z.object({
  username: z.string().transform(normalizeUsername).pipe(z.string().min(1).max(64)),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const RegisterRequest = z.object({
  accessCode: AccessCode,
  name: PersonName,
  username: Username,
  password: Password,
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;

export const ChangePasswordRequest = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: Password,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'The new password must differ from the current one',
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const SessionUser = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  role: Role,
});
export type SessionUser = z.infer<typeof SessionUser>;

export const Membership = z.object({
  groupId: z.string(),
  groupName: z.string(),
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  isModerator: z.boolean(),
});
export type Membership = z.infer<typeof Membership>;

/** Returned by `GET /auth/me`, login and register. Teachers have no memberships. */
export const MeResponse = z.object({
  user: SessionUser,
  memberships: z.array(Membership),
});
export type MeResponse = z.infer<typeof MeResponse>;
