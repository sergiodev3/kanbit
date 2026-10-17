import { StartSprintRequest, cuid2Id } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { SprintsService } from './sprints.service';

export function createSprintsController(service: SprintsService) {
  const start: RequestHandler = async (req, res) => {
    const teamId = cuid2Id.parse(req.params.id);
    res.status(201).json(await service.start(currentUser(req), teamId, StartSprintRequest.parse(req.body)));
  };

  const close: RequestHandler = async (req, res) => {
    res.json(await service.close(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  return { start, close };
}
