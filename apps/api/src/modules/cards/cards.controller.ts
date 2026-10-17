import { CreateCardRequest, MoveCardRequest, UpdateCardRequest, cuid2Id } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { CardsService } from './cards.service';

export function createCardsController(service: CardsService) {
  const board: RequestHandler = async (req, res) => {
    res.json(await service.board(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const create: RequestHandler = async (req, res) => {
    const teamId = cuid2Id.parse(req.params.id);
    const { card, created } = await service.create(currentUser(req), teamId, CreateCardRequest.parse(req.body));
    res.status(created ? 201 : 200).json(card);
  };

  const get: RequestHandler = async (req, res) => {
    res.json(await service.get(currentUser(req), cuid2Id.parse(req.params.id)));
  };

  const update: RequestHandler = async (req, res) => {
    const cardId = cuid2Id.parse(req.params.id);
    res.json(await service.update(currentUser(req), cardId, UpdateCardRequest.parse(req.body)));
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(currentUser(req), cuid2Id.parse(req.params.id));
    res.status(204).end();
  };

  const move: RequestHandler = async (req, res) => {
    const cardId = cuid2Id.parse(req.params.id);
    res.json(await service.move(currentUser(req), cardId, MoveCardRequest.parse(req.body)));
  };

  return { board, create, get, update, remove, move };
}
