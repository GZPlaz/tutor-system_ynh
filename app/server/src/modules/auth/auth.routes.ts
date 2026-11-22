/**
 * /api/auth — public + self-service endpoints.
 *
 *  POST /register          public; creates a student (PENDING or ACTIVE, per Admin → Settings)
 *  POST /login             → { accessToken, user } + refresh cookie
 *  POST /refresh           cookie → new access token (+ rotated cookie)
 *  POST /logout            revokes the current refresh token
 *  POST /logout-all        revokes every session for the caller
 *  POST /forgot-password   always 202
 *  POST /reset-password    token + new password (also used by invites)
 *  GET  /me                current user, roles, permissions
 *  PATCH /me               update name / timezone
 *  POST /me/password       change password
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { Unauthorized } from '../../lib/errors.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authOf } from '../../middleware/authorize.js';
import { parsed, validate } from '../../middleware/validate.js';
import { authLimiter, loginLimiter, requireSameOrigin } from '../../middleware/security.js';
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  UpdateProfileSchema,
} from './auth.schemas.js';
import * as auth from './auth.service.js';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  revokeAllSessions,
  revokeRefreshToken,
  rotateRefreshToken,
  setRefreshCookie,
} from './tokens.js';

export const authRouter = Router();

const meta = (req: { ip?: string; headers: Record<string, unknown> }) => ({
  ip: req.ip,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});

authRouter.post('/register', authLimiter, validate({ body: RegisterSchema }), async (req, res) => {
  const result = await auth.register(parsed(req, 'body', RegisterSchema));
  res.status(201).json({
    ...result,
    message:
      result.status === 'PENDING'
        ? 'Registration received. You will get an email once an administrator approves your account.'
        : 'Your account is ready. You can sign in now.',
  });
});

authRouter.post('/login', loginLimiter, validate({ body: LoginSchema }), async (req, res) => {
  const { accessToken, refreshToken, user } = await auth.login(parsed(req, 'body', LoginSchema), meta(req));
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken, user });
});

authRouter.post('/refresh', requireSameOrigin, async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  // Not signed in is the normal state for visitors: answer quietly (no 401 noise in the console).
  if (!raw) return void res.status(204).end();
  try {
    const { userId, refreshToken } = await rotateRefreshToken(raw, meta(req));
    const accessToken = await auth.issueAccessTokenFor(userId);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user: await auth.getSessionUser(userId) });
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
});

authRouter.post('/logout', requireSameOrigin, async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (raw) await revokeRefreshToken(raw);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/logout-all', authenticate, async (req, res) => {
  await revokeAllSessions(authOf(req).userId);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/forgot-password', authLimiter, validate({ body: ForgotPasswordSchema }), async (req, res) => {
  await auth.requestPasswordReset(parsed(req, 'body', ForgotPasswordSchema).email);
  res.status(202).json({ message: 'If that email is registered, a reset link is on its way.' });
});

authRouter.post('/reset-password', authLimiter, validate({ body: ResetPasswordSchema }), async (req, res) => {
  const { token, password } = parsed(req, 'body', ResetPasswordSchema);
  await auth.resetPassword(token, password);
  res.json({ message: 'Password updated. You can now sign in.' });
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json(await auth.getSessionUser(authOf(req).userId));
});

authRouter.patch('/me', authenticate, validate({ body: UpdateProfileSchema }), async (req, res) => {
  const userId = authOf(req).userId;
  await prisma.user.update({ where: { id: userId }, data: parsed(req, 'body', UpdateProfileSchema) });
  res.json(await auth.getSessionUser(userId));
});

/** Finish/skip the welcome tour ({ done: true }) or ask to see it again ({ done: false }). */
authRouter.post('/me/tour', authenticate, validate({ body: z.object({ done: z.boolean() }) }), async (req, res) => {
  const userId = authOf(req).userId;
  const { done } = req.valid.body as { done: boolean };
  await prisma.user.update({ where: { id: userId }, data: { tourCompletedAt: done ? new Date() : null } });
  res.json(await auth.getSessionUser(userId));
});

/** Signed in but forgot the current password: email a reset link to the account's own address. */
authRouter.post('/me/password-reset-email', authenticate, authLimiter, async (req, res) => {
  const { email } = await auth.sendPasswordResetTo(authOf(req).userId);
  res.json({ message: `We sent a reset link to ${email}.` });
});

authRouter.post('/me/password', authenticate, validate({ body: ChangePasswordSchema }), async (req, res) => {
  const { currentPassword, newPassword } = parsed(req, 'body', ChangePasswordSchema);
  await auth.changePassword(authOf(req).userId, currentPassword, newPassword);
  clearRefreshCookie(res);
  res.json({ message: 'Password changed. Please sign in again.' });
});
