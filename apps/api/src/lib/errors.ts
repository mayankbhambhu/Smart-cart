export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const unprocessable = (message: string, code = 'UNPROCESSABLE', details?: unknown) => new AppError(422, code, message, details);
export const tooManyRequests = (message = 'Too many attempts, please try again later') => new AppError(429, 'RATE_LIMITED', message);

/** Postgres unique_violation */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const candidate = (error as { cause?: unknown })?.cause ?? error;
  const pgError = candidate as { code?: string; constraint?: string };
  return pgError?.code === '23505' && (!constraint || pgError.constraint === constraint);
}
