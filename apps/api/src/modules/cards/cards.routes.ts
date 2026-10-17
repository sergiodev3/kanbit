import { Router, type RequestHandler } from 'express';
import { createCardsController } from './cards.controller';
import type { CardsService } from './cards.service';

export interface CardsRouterDeps {
  service: CardsService;
  requireAuth: RequestHandler;
}

/** Team- and card-level authorization (member / moderator / assignee / teacher) is checked in the service. */
export function createCardsRouter({ service, requireAuth }: CardsRouterDeps): Router {
  const controller = createCardsController(service);
  const router = Router();

  router.get('/teams/:id/board', requireAuth, controller.board);
  router.post('/teams/:id/cards', requireAuth, controller.create);
  router.get('/cards/:id', requireAuth, controller.get);
  router.patch('/cards/:id', requireAuth, controller.update);
  router.delete('/cards/:id', requireAuth, controller.remove);
  router.post('/cards/:id/move', requireAuth, controller.move);

  return router;
}
