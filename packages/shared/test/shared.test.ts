import { describe, expect, it } from 'vitest';
import {
  ChangePasswordRequest,
  LoginRequest,
  MeResponse,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RegisterRequest,
  ResetPasswordResponse,
  SessionUser,
  USERNAME_MAX_LENGTH,
  Weekday,
  cuid2Id,
  normalizeUsername,
} from '../src/index';

describe('shared schemas', () => {
  it('accepts only school weekdays', () => {
    expect(Weekday.options).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(Weekday.safeParse('SAT').success).toBe(false);
  });

  it('validates cuid2 ids', () => {
    expect(cuid2Id.safeParse('tz4a98xxat96iws9zmbrgj3a').success).toBe(true);
    expect(cuid2Id.safeParse('Not-A-Cuid!').success).toBe(false);
  });
});

describe('auth schemas', () => {
  const validRegister = {
    accessCode: ' ab12cd ',
    name: '  Ana López ',
    username: '  A01234567 ',
    password: 'secret-pass',
  };

  it('normalises usernames (trim + lowercase)', () => {
    expect(normalizeUsername('  JuanP.Dev ')).toBe('juanp.dev');
    expect(LoginRequest.parse({ username: ' Maestra ', password: 'x' }).username).toBe('maestra');
  });

  it('normalises register input: username, trimmed name and uppercase access code', () => {
    expect(RegisterRequest.parse(validRegister)).toEqual({
      accessCode: 'AB12CD',
      name: 'Ana López',
      username: 'a01234567',
      password: 'secret-pass',
    });
  });

  it('enforces username length and charset limits', () => {
    const parse = (username: string) => RegisterRequest.safeParse({ ...validRegister, username }).success;
    expect(parse('ab')).toBe(false);
    expect(parse('abc')).toBe(true);
    expect(parse('a'.repeat(USERNAME_MAX_LENGTH))).toBe(true);
    expect(parse('a'.repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
    expect(parse('juan perez')).toBe(false);
    expect(parse('juan_perez-1.dev')).toBe(true);
  });

  it('enforces password length limits on registration', () => {
    const parse = (password: string) => RegisterRequest.safeParse({ ...validRegister, password }).success;
    expect(parse('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(parse('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(parse('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });

  it('rejects blank names and access codes', () => {
    expect(RegisterRequest.safeParse({ ...validRegister, name: '   ' }).success).toBe(false);
    expect(RegisterRequest.safeParse({ ...validRegister, accessCode: '  ' }).success).toBe(false);
  });

  it('requires both login fields but does not apply registration rules to them', () => {
    expect(LoginRequest.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(LoginRequest.safeParse({ username: 'ab', password: '' }).success).toBe(false);
    expect(LoginRequest.safeParse({ username: 'ab', password: 'short' }).success).toBe(true);
  });

  it('requires a valid new password different from the current one', () => {
    expect(ChangePasswordRequest.safeParse({ currentPassword: 'old-pass', newPassword: 'new-pass-1' }).success).toBe(
      true,
    );
    expect(ChangePasswordRequest.safeParse({ currentPassword: 'old-pass', newPassword: 'short' }).success).toBe(false);
    expect(ChangePasswordRequest.safeParse({ currentPassword: 'same-pass', newPassword: 'same-pass' }).success).toBe(
      false,
    );
  });

  it('describes the session user and memberships returned by /auth/me', () => {
    const me = {
      user: { id: 'tz4a98xxat96iws9zmbrgj3a', name: 'Ana', username: 'ana', role: 'STUDENT' },
      memberships: [{ groupId: 'g1', groupName: '5A', teamId: null, teamName: null, isModerator: false }],
    };
    expect(MeResponse.parse(me)).toEqual(me);
    expect(SessionUser.safeParse({ ...me.user, role: 'ADMIN' }).success).toBe(false);
  });

  it('describes the one-time temporary password response', () => {
    expect(ResetPasswordResponse.safeParse({ temporaryPassword: 'abcd-efgh-jkmn' }).success).toBe(true);
    expect(ResetPasswordResponse.safeParse({}).success).toBe(false);
  });
});
