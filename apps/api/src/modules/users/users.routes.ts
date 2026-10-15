import { Router, type RequestHandler } from 'express';
import { requireTeacher } from '../../http/authz';
import { createUsersController } from './users.controller';
import type { UsersService } from './users.service';

export interface UsersRouterDeps {
  service: UsersService;
  requireAuth: RequestHandler;
}

export function createUsersRouter({ service, requireAuth }: UsersRouterDeps): Router {
  const controller = createUsersController(service);
  const router = Router();

  router.post('/users/:id/reset-password', requireAuth, requireTeacher, controller.resetPassword);

  return router;
}
