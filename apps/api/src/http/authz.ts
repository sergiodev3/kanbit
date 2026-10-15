import type { RequestHandler } from 'express';
import { currentUser } from './auth';
import { AppError } from './errors';

export const forbidden = () => new AppError(403, 'FORBIDDEN', 'Not allowed');

/** Only teachers pass (spec §3). Mount after `requireAuth`. */
export const requireTeacher: RequestHandler = (req, _res, next) => {
  if (currentUser(req).role !== 'TEACHER') throw forbidden();
  next();
};
