import { UpdateMeetingRequest, cuid2Id } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { MeetingsService } from './meetings.service';

export function createMeetingsController(service: MeetingsService) {
  const today: RequestHandler = async (req, res) => {
    res.json(await service.today(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await service.create(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const get: RequestHandler = async (req, res) => {
    res.json(await service.get(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const update: RequestHandler = async (req, res) => {
    const meetingId = cuid2Id.parse(req.params.id);
    res.json(await service.update(currentUser(req), meetingId, UpdateMeetingRequest.parse(req.body)));
  };

  const start: RequestHandler = async (req, res) => {
    res.json(await service.start(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const end: RequestHandler = async (req, res) => {
    res.json(await service.end(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  return { today, create, get, update, start, end };
}
