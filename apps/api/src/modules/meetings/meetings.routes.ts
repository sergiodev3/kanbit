import { Router, type RequestHandler } from 'express';
import { createMeetingsController } from './meetings.controller';
import type { MeetingsService } from './meetings.service';

export interface MeetingsRouterDeps {
  service: MeetingsService;
  requireAuth: RequestHandler;
}

/** Team-level authorization (member / moderator / teacher) is checked in the service. */
export function createMeetingsRouter({ service, requireAuth }: MeetingsRouterDeps): Router {
  const controller = createMeetingsController(service);
  const router = Router();

  router.get('/teams/:id/meetings/today', requireAuth, controller.today);
  router.post('/teams/:id/meetings', requireAuth, controller.create);
  router.get('/meetings/:id', requireAuth, controller.get);
  router.patch('/meetings/:id', requireAuth, controller.update);
  router.post('/meetings/:id/start', requireAuth, controller.start);
  router.post('/meetings/:id/end', requireAuth, controller.end);
  router.put('/meetings/:id/checkins/me', requireAuth, controller.putMyCheckin);
  router.patch('/meetings/:id/checkins/:userId', requireAuth, controller.captureCheckin);

  return router;
}
