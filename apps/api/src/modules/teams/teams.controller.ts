import {
  CreateTeamRequest,
  SetModeratorRequest,
  SetTeamMembersRequest,
  UpdateTeamRequest,
  cuid2Id,
} from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { TeamsService } from './teams.service';

export function createTeamsController(service: TeamsService) {
  const list: RequestHandler = async (req, res) => {
    res.json(await service.list(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const create: RequestHandler = async (req, res) => {
    const groupId = cuid2Id.parse(req.params.id);
    res.status(201).json(await service.create(currentUser(req), groupId, CreateTeamRequest.parse(req.body)));
  };

  const rename: RequestHandler = async (req, res) => {
    const teamId = cuid2Id.parse(req.params.id);
    res.json(await service.rename(currentUser(req), teamId, UpdateTeamRequest.parse(req.body)));
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(currentUser(req), cuid2Id.parse(req.params.id));
    res.status(204).end();
  };

  const setMembers: RequestHandler = async (req, res) => {
    const teamId = cuid2Id.parse(req.params.id);
    res.json(await service.setMembers(currentUser(req), teamId, SetTeamMembersRequest.parse(req.body)));
  };

  const setModerator: RequestHandler = async (req, res) => {
    const teamId = cuid2Id.parse(req.params.id);
    res.json(await service.setModerator(currentUser(req), teamId, SetModeratorRequest.parse(req.body)));
  };

  return { list, create, rename, remove, setMembers, setModerator };
}
