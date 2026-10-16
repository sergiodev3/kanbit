import { CreateGroupRequest, UpdateGroupRequest, cuid2Id } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { GroupsService } from './groups.service';

export function createGroupsController(service: GroupsService) {
  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(currentUser(req)));
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await service.create(currentUser(req), CreateGroupRequest.parse(req.body)));
  };

  const get: RequestHandler = async (req, res) => {
    res.json(await service.get(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const update: RequestHandler = async (req, res) => {
    const groupId = cuid2Id.parse(req.params.id);
    res.json(await service.update(currentUser(req), groupId, UpdateGroupRequest.parse(req.body)));
  };

  const regenerateAccessCode: RequestHandler = async (req, res) => {
    res.json(await service.regenerateAccessCode(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  return { list, create, get, update, regenerateAccessCode };
}
