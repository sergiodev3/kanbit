import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Expected, client-facing error. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const body = (code: string, message: string, details?: unknown): ErrorBody => ({
  error: details === undefined ? { code, message } : { code, message, details },
});

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

/** Shape of errors raised by express.json() (body-parser / http-errors). */
interface HttpParserError {
  status: number;
  type?: string;
  expose?: boolean;
}

const isParserError = (err: unknown): err is HttpParserError =>
  typeof err === 'object' &&
  err !== null &&
  'status' in err &&
  typeof err.status === 'number' &&
  'expose' in err &&
  err.expose === true;

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details));
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json(body('VALIDATION_ERROR', 'Invalid request', err.issues));
    return;
  }
  if (isParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json(body('INVALID_JSON', 'Malformed JSON body'));
      return;
    }
    if (err.type === 'entity.too.large') {
      res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Request body too large'));
      return;
    }
    res.status(err.status).json(body('BAD_REQUEST', 'Bad request'));
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  res.status(500).json(body('INTERNAL_ERROR', 'Internal server error'));
};
