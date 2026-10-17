import { Router, type RequestHandler } from 'express';
import { createSprintsController } from './sprints.controller';
import type { SprintsService } from './sprints.service';

export interface SprintsRouterDeps {
  service: SprintsService;
  requireAuth: RequestHandler;
}

/** Team-level authorization (moderator / teacher) is checked in the service. */
export function createSprintsRouter({ service, requireAuth }: SprintsRouterDeps): Router {
  const controller = createSprintsController(service);
  const router = Router();

  router.post('/teams/:id/sprints', requireAuth, controller.start);
  router.post('/sprints/:id/close', requireAuth, controller.close);

  return router;
}
