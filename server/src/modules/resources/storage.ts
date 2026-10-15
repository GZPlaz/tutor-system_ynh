/**
 * File storage for the Resource Hub.
 *
 * Files live in UPLOAD_DIR (outside the public www/ folder) under random
 * names, and are only ever served through the authorised download endpoint.
 * To move to S3/MinIO later, re-implement `saveTarget`, `absolutePath` and
 * `removeFile` — callers don't care where bytes live.
 */
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { BadRequest } from '../../lib/errors.js';

const ROOT = path.resolve(env.UPLOAD_DIR);
mkdirSync(ROOT, { recursive: true });

/** Whitelist: documents, slides, sheets, images, audio/video, plain text. */
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'audio/mpeg',
  'video/mp4',
  'application/zip',
]);

export const upload = multer({
  storage: multer.diskStorage({
    destination: ROOT,
    // Never trust the client's filename on disk.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 10)}`),
  }),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(BadRequest(`File type ${file.mimetype} is not allowed`));
  },
});

export function absolutePath(storageKey: string): string {
  const full = path.resolve(ROOT, storageKey);
  if (!full.startsWith(ROOT + path.sep)) throw BadRequest('Invalid storage key'); // path traversal guard
  return full;
}

export async function removeFile(storageKey: string | null | undefined): Promise<void> {
  if (!storageKey) return;
  await unlink(absolutePath(storageKey)).catch(() => undefined);
}
