import { Router, type RequestHandler } from 'express';
import { requireTeacher } from '../../http/authz';
import { createTeamsController } from './teams.controller';
import type { TeamsService } from './teams.service';

export interface TeamsRouterDeps {
  service: TeamsService;
  requireAuth: RequestHandler;
}

export function createTeamsRouter({ service, requireAuth }: TeamsRouterDeps): Router {
  const controller = createTeamsController(service);
  const router = Router();
  const teacher = [requireAuth, requireTeacher];

  router.get('/groups/:id/teams', ...teacher, controller.list);
  router.post('/groups/:id/teams', ...teacher, controller.create);
  router.patch('/teams/:id', ...teacher, controller.rename);
  router.delete('/teams/:id', ...teacher, controller.remove);
  router.put('/teams/:id/members', ...teacher, controller.setMembers);
  router.patch('/teams/:id/moderator', ...teacher, controller.setModerator);

  return router;
}
