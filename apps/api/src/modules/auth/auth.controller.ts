import { ChangePasswordRequest, LoginRequest, RegisterRequest, type SessionUser } from '@kanbit/shared';
import type { RequestHandler, Response } from 'express';
import {
  type AuthConfig,
  clearSessionCookie,
  currentUser,
  setSessionCookie,
  signSessionToken,
} from '../../http/auth';
import type { Clock } from '../../lib/clock';
import type { AuthService } from './auth.service';

export interface AuthControllerDeps {
  service: AuthService;
  config: AuthConfig;
  clock: Clock;
}

export function createAuthController({ service, config, clock }: AuthControllerDeps) {
  async function startSession(res: Response, user: SessionUser, status: number): Promise<void> {
    setSessionCookie(res, await signSessionToken(user.id, config, clock), config);
    res
      .status(status)
      .set('Cache-Control', 'no-store')
      .json(await service.getMe(user));
  }

  const register: RequestHandler = async (req, res) => {
    const user = await service.register(RegisterRequest.parse(req.body));
    await startSession(res, user, 201);
  };

  const login: RequestHandler = async (req, res) => {
    const user = await service.login(LoginRequest.parse(req.body));
    await startSession(res, user, 200);
  };

  const logout: RequestHandler = (_req, res) => {
    clearSessionCookie(res, config);
    res.status(204).end();
  };

  const me: RequestHandler = async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await service.getMe(currentUser(req)));
  };

  const changePassword: RequestHandler = async (req, res) => {
    await service.changePassword(currentUser(req).id, ChangePasswordRequest.parse(req.body));
    res.status(204).end();
  };

  return { register, login, logout, me, changePassword };
}
