/**
 * Free study packets.
 *
 * Public (no account):
 *   GET  /api/public/packets                    published packets, grouped by subject in the UI
 *   GET  /api/public/packets/:id/download[?view=1]   the file (view=1 opens it in the browser)
 *
 * Admin (`packets:manage`):
 *   GET    /api/packets                         every packet, with download counts
 *   POST   /api/packets                         multipart: file + title, subject, description?, pageCount?, isPublished?, sortOrder?
 *   PATCH  /api/packets/:id                     multipart or JSON; an attached file replaces the old one
 *   DELETE /api/packets/:id
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { BadRequest } from '../../lib/errors.js';
import { P } from '../rbac/permissions.js';
import { absolutePath, removeFile, upload } from '../resources/storage.js';
import * as svc from './packets.service.js';

const Uuid = z.string().uuid();
const IdParams = z.object({ id: Uuid });

/** Packets are documents people print: PDF, Word or OpenDocument text only. */
const PACKET_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
]);

// ---- public -----------------------------------------------------------------

export const publicPacketsRouter = Router();

const downloadLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many downloads from this network. Please try again later.' } },
});

publicPacketsRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(await svc.listPublished());
});

publicPacketsRouter.get(
  '/:id/download',
  downloadLimiter,
  validate({ params: IdParams, query: z.object({ view: z.enum(['0', '1']).optional() }) }),
  async (req, res) => {
    const p = await svc.openPublished(parsed(req, 'params', IdParams).id);
    const inline = (req.valid.query as { view?: string }).view === '1' && p.mimeType === 'application/pdf';
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (inline) {
      res.type('application/pdf');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(p.originalName)}`);
      res.sendFile(absolutePath(p.storageKey));
    } else {
      res.download(absolutePath(p.storageKey), p.originalName);
    }
  },
);

// ---- admin ------------------------------------------------------------------

export const packetsRouter = Router();
packetsRouter.use(authenticate, requirePermission(P.PACKETS_MANAGE));

/** Multipart fields arrive as strings; empty strings mean "not set". */
const blankToUndef = (v: unknown) => (v === '' ? undefined : v);
const Bool = z.preprocess((v) => (v === 'true' || v === 'on' ? true : v === 'false' ? false : v), z.boolean());

const Fields = {
  title: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(80),
  description: z.preprocess(blankToUndef, z.string().trim().max(2000).nullable().optional()),
  pageCount: z.preprocess(blankToUndef, z.coerce.number().int().min(1).max(2000).nullable().optional()),
  isPublished: Bool.optional(),
  sortOrder: z.preprocess(blankToUndef, z.coerce.number().int().min(-1000).max(1000).optional()),
};
const CreateBody = z.object(Fields);
const UpdateBody = z.object(Fields).partial();

function fileOf(req: Request): svc.PacketFile | undefined {
  if (!req.file) return undefined;
  if (!PACKET_MIME.has(req.file.mimetype)) throw BadRequest('Packets must be a PDF or Word document');
  return { storageKey: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size };
}

/** Runs `fn`; if it fails, the uploaded file is deleted so nothing is left orphaned on disk. */
async function cleaningUp<T>(req: Request, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await removeFile(req.file?.filename);
    throw err;
  }
}

packetsRouter.get('/', async (_req, res) => {
  res.json(await svc.listAll());
});

packetsRouter.post('/', upload.single('file'), async (req, res) => {
  const packet = await cleaningUp(req, async () => {
    validate({ body: CreateBody })(req, res, () => undefined);
    const body = parsed(req, 'body', CreateBody);
    const file = fileOf(req);
    if (!file) throw BadRequest('Attach the packet file (PDF or Word)');
    return svc.createPacket(authOf(req), {
      ...body,
      description: body.description ?? null,
      pageCount: body.pageCount ?? null,
      isPublished: body.isPublished ?? true,
      sortOrder: body.sortOrder ?? 0,
      file,
    });
  });
  res.status(201).json(packet);
});

packetsRouter.patch('/:id', upload.single('file'), async (req, res) => {
  const packet = await cleaningUp(req, async () => {
    validate({ params: IdParams, body: UpdateBody })(req, res, () => undefined);
    return svc.updatePacket(authOf(req), parsed(req, 'params', IdParams).id, parsed(req, 'body', UpdateBody), fileOf(req));
  });
  res.json(packet);
});

packetsRouter.delete('/:id', validate({ params: IdParams }), async (req, res) => {
  await svc.deletePacket(authOf(req), parsed(req, 'params', IdParams).id);
  res.status(204).end();
});
