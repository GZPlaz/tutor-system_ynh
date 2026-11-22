/**
 * Central error handling. Express 5 forwards rejected promises from async
 * handlers here automatically, so routes can simply `throw`.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appErr: AppError;

  if (err instanceof AppError) {
    appErr = err;
  } else if (isExclusionViolation(err)) {
    // bookings_no_tutor_overlap / bookings_no_student_overlap (see migration.sql)
    appErr = new AppError(409, 'SLOT_TAKEN', 'That time is no longer available. Please pick another slot.');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    appErr = new AppError(409, 'DUPLICATE', 'A record with these values already exists');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    appErr = new AppError(404, 'NOT_FOUND', 'Record not found');
  } else if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Upload is too large');
  } else if (err?.type === 'entity.parse.failed') {
    appErr = new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
  } else {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
    appErr = new AppError(500, 'INTERNAL', 'Something went wrong. Please try again.');
  }

  const reference = appErr.status >= 500 ? String(req.id ?? '') || undefined : undefined;
  if (appErr.status >= 500) logger.error({ err, reference }, appErr.message);

  res.status(appErr.status).json({
    error: { code: appErr.code, message: appErr.message, details: appErr.details, reference },
  });
};

/** PostgreSQL SQLSTATE 23P01 = exclusion_violation. Prisma surfaces it as raw text. */
function isExclusionViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  return msg.includes('23P01') || msg.includes('violates exclusion constraint') || msg.includes('bookings_no_');
}
