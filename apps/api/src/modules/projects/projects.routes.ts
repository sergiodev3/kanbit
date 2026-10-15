import { Router, type RequestHandler } from 'express';
import { createProjectsController } from './projects.controller';
import type { ProjectsService } from './projects.service';

export interface ProjectsRouterDeps {
  service: ProjectsService;
  requireAuth: RequestHandler;
}

/** Team-level authorization (member / moderator / teacher) is checked in the service. */
export function createProjectsRouter({ service, requireAuth }: ProjectsRouterDeps): Router {
  const controller = createProjectsController(service);
  const router = Router();

  router.get('/teams/:id/projects', requireAuth, controller.list);
  router.post('/teams/:id/projects', requireAuth, controller.create);
  router.patch('/projects/:id', requireAuth, controller.rename);

  return router;
}
