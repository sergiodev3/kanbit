import { cuid2Id } from '@kanbit/shared';
import type { RequestHandler } from 'express';
import { currentUser } from '../../http/auth';
import type { UsersService } from './users.service';

export function createUsersController(service: UsersService) {
  const resetPassword: RequestHandler = async (req, res) => {
    const studentId = cuid2Id.parse(req.params.id);
    const result = await service.resetPassword(currentUser(req).id, studentId);
    // The temporary password is shown once and must never be cached.
    res.set('Cache-Control', 'no-store').json(result);
  };

  return { resetPassword };
}
