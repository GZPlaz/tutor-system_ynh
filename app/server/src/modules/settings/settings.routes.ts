/**
 * /api/branding
 *   GET    /           public — current branding (used before sign-in)
 *   PUT    /           settings:manage — save any subset of fields
 *   POST   /reset      settings:manage — back to defaults (keeps the logo)
 *   GET    /logo       public — the logo image (cache-busted by ?v=)
 *   POST   /logo       settings:manage — multipart field "logo": PNG, JPEG or WebP, max 2 MB
 *   DELETE /logo       settings:manage
 *
 * SVG logos are not accepted: an SVG served from our own origin could carry
 * script. PNG/JPEG/WebP cover every real need.
 */
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf, requirePermission } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import { P } from '../rbac/permissions.js';
import { BrandingSchema, getBranding, getLogoFile, resetBranding, setLogo, updateBranding } from './branding.js';
import { SettingsPatchSchema, loadSettings, updateSettings } from './general.js';

export const brandingRouter = Router();

const DIR = path.resolve(env.UPLOAD_DIR, 'branding');
mkdirSync(DIR, { recursive: true });
const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const upload = multer({
  storage: multer.diskStorage({ destination: DIR, filename: (_req, _file, cb) => cb(null, `incoming-${Date.now()}`) }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (LOGO_TYPES[file.mimetype] ? cb(null, true) : cb(BadRequest('Use a PNG, JPEG or WebP image'))),
});

brandingRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json(await getBranding());
});

brandingRouter.put(
  '/',
  authenticate,
  requirePermission(P.SETTINGS_MANAGE),
  validate({ body: BrandingSchema.partial() }),
  async (req, res) => {
    const patch = parsed(req, 'body', BrandingSchema.partial());
    const result = await updateBranding(authOf(req).userId, patch);
    await audit(authOf(req).userId, 'branding.updated', 'settings', 'branding', { fields: Object.keys(patch) });
    res.json(result);
  },
);

brandingRouter.post('/reset', authenticate, requirePermission(P.SETTINGS_MANAGE), async (req, res) => {
  const result = await resetBranding(authOf(req).userId);
  await audit(authOf(req).userId, 'branding.reset', 'settings', 'branding');
  res.json(result);
});

brandingRouter.get('/logo', async (_req, res) => {
  const logo = await getLogoFile();
  if (!logo) throw NotFound('Logo');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // emails embed the logo
  res.sendFile(path.join(DIR, `logo.${logo.ext}`));
});

brandingRouter.post('/logo', authenticate, requirePermission(P.SETTINGS_MANAGE), upload.single('logo'), async (req, res) => {
  if (!req.file) throw BadRequest('Choose an image to upload');
  const ext = LOGO_TYPES[req.file.mimetype]!;
  const previous = await getLogoFile();
  await rename(req.file.path, path.join(DIR, `logo.${ext}`));
  if (previous && previous.ext !== ext) await unlink(path.join(DIR, `logo.${previous.ext}`)).catch(() => undefined);
  const result = await setLogo(authOf(req).userId, { ext });
  await audit(authOf(req).userId, 'branding.logo_uploaded', 'settings', 'branding');
  res.json(result);
});

brandingRouter.delete('/logo', authenticate, requirePermission(P.SETTINGS_MANAGE), async (req, res) => {
  const previous = await getLogoFile();
  if (previous) await unlink(path.join(DIR, `logo.${previous.ext}`)).catch(() => undefined);
  res.json(await setLogo(authOf(req).userId, null));
});

/**
 * /api/settings   (settings:manage)
 *   GET  /   current site settings (sign-ups, booking rules, maintenance)
 *   PUT  /   save any subset; sections merge field by field
 */
export const settingsRouter = Router();
settingsRouter.use(authenticate, requirePermission(P.SETTINGS_MANAGE));

settingsRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await loadSettings());
});

settingsRouter.put('/', validate({ body: SettingsPatchSchema }), async (req, res) => {
  const patch = parsed(req, 'body', SettingsPatchSchema);
  const result = await updateSettings(authOf(req).userId, patch);
  await audit(authOf(req).userId, 'settings.updated', 'settings', 'general', patch);
  res.json(result);
});
