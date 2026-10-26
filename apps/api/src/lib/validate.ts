import type { z } from 'zod';
import { AppError } from './errors';

/** Parses request input with a shared zod schema; throws a 400 with field errors. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  const first = fields[0];
  const message = first ? (first.path ? `${first.path}: ${first.message}` : first.message) : 'Invalid request';
  throw new AppError(400, 'VALIDATION_ERROR', message, { fields });
}
