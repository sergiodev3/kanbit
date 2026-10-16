import { CreateProjectRequest, UpdateProjectRequest, cuid2Id } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { ProjectsService } from './projects.service';

export function createProjectsController(service: ProjectsService) {
  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const create: RequestHandler = async (req, res) => {
    const teamId = cuid2Id.parse(req.params.id);
    res.status(201).json(await service.create(currentUser(req), teamId, CreateProjectRequest.parse(req.body)));
  };

  const rename: RequestHandler = async (req, res) => {
    const projectId = cuid2Id.parse(req.params.id);
    res.json(await service.rename(currentUser(req), projectId, UpdateProjectRequest.parse(req.body)));
  };

  return { list, create, rename };
}
