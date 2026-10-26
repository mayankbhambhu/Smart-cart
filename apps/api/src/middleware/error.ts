import type { ApiErrorBody } from '@smartcart/shared';
import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env';
import { AppError, isUniqueViolation } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } };
  res.status(404).json(body);
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (isUniqueViolation(error)) {
    appError = new AppError(409, 'DUPLICATE', 'That record already exists');
  } else if ((error as { type?: string }).type === 'entity.parse.failed') {
    appError = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  } else if ((error as { type?: string }).type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else {
    logger.error({ err: error, path: req.path, method: req.method }, 'Unhandled error');
    appError = new AppError(500, 'INTERNAL', isProduction ? 'Something went wrong' : String((error as Error)?.message ?? error));
  }
  if (appError.status >= 500 && error instanceof AppError) logger.error({ err: error }, 'Server error');
  const body: ApiErrorBody = {
    error: { code: appError.code, message: appError.message, ...(appError.details ? { details: appError.details } : {}) },
  };
  res.status(appError.status).json(body);
}
