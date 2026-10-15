import { Router, type RequestHandler } from 'express';
import { createAuthRateLimiter } from '../../http/rate-limit';
import { createAuthController, type AuthControllerDeps } from './auth.controller';

export interface AuthRouterDeps extends AuthControllerDeps {
  requireAuth: RequestHandler;
  rateLimit: boolean;
}

export function createAuthRouter({ requireAuth, rateLimit, ...deps }: AuthRouterDeps): Router {
  const controller = createAuthController(deps);
  const router = Router();

  router.post('/auth/register', ...createAuthRateLimiter(rateLimit), controller.register);
  router.post('/auth/login', ...createAuthRateLimiter(rateLimit), controller.login);
  router.post('/auth/logout', controller.logout);
  router.get('/auth/me', requireAuth, controller.me);
  router.post('/auth/change-password', requireAuth, controller.changePassword);

  return router;
}
