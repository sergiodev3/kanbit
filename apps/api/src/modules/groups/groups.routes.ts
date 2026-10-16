import { Router, type RequestHandler } from 'express';
import { requireTeacher } from '../../http/authz';
import { createGroupsController } from './groups.controller';
import type { GroupsService } from './groups.service';

export interface GroupsRouterDeps {
  service: GroupsService;
  requireAuth: RequestHandler;
}

export function createGroupsRouter({ service, requireAuth }: GroupsRouterDeps): Router {
  const controller = createGroupsController(service);
  const router = Router();
  const teacher = [requireAuth, requireTeacher];

  router.get('/groups', ...teacher, controller.list);
  router.post('/groups', ...teacher, controller.create);
  router.get('/groups/:id', ...teacher, controller.get);
  router.patch('/groups/:id', ...teacher, controller.update);
  router.post('/groups/:id/access-code/regenerate', ...teacher, controller.regenerateAccessCode);

  return router;
}
