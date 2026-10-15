/**
 * Token strategy
 * --------------
 * ACCESS TOKEN  — short-lived JWT (default 15 min), HS256, sent by the SPA in
 *                 the Authorization header and kept only in memory (never in
 *                 localStorage → not readable by injected scripts after reload).
 * REFRESH TOKEN — long-lived opaque random string in an HttpOnly, Secure,
 *                 SameSite=Strict cookie scoped to /api/auth. Stored hashed.
 *                 Rotated on every refresh; presenting an already-rotated
 *                 token revokes the entire token family (stolen-token defence).
 */
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { generateOpaqueToken, sha256 } from '../../lib/crypto.js';
import { Unauthorized } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const ISSUER = 'mindaccel-api';
export const REFRESH_COOKIE = 'ma_refresh';

export interface AccessClaims {
  sub: string; // user id
  tv: number; // token version (bump to revoke all access tokens)
}

export function signAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ tv: tokenVersion } satisfies Omit<AccessClaims, 'sub'>, env.JWT_ACCESS_SECRET, {
    subject: userId,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_MIN * 60,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    return { sub: payload.sub, tv: Number(payload.tv ?? 0) };
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw Unauthorized(expired ? 'Access token expired' : 'Invalid access token', expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
  }
}

/** Creates a refresh token row and returns the raw token for the cookie. */
export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string; ip?: string },
  familyId: string = randomUUID(),
): Promise<string> {
  const raw = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent: meta.userAgent?.slice(0, 255),
      ip: meta.ip,
    },
  });
  return raw;
}

/**
 * Validates + rotates a refresh token. Returns the user id and the NEW raw
 * refresh token. Reuse of a rotated token kills the whole family.
 */
export async function rotateRefreshToken(raw: string, meta: { userAgent?: string; ip?: string }) {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!record) throw Unauthorized('Session not found', 'REFRESH_INVALID');

  if (record.revokedAt || record.replacedAt) {
    logger.warn({ userId: record.userId, familyId: record.familyId }, 'Refresh token reuse detected — revoking family');
    await revokeFamily(record.familyId);
    throw Unauthorized('Session revoked', 'REFRESH_REUSED');
  }
  if (record.expiresAt < new Date()) throw Unauthorized('Session expired', 'REFRESH_EXPIRED');

  await prisma.refreshToken.update({ where: { id: record.id }, data: { replacedAt: new Date() } });
  const next = await issueRefreshToken(record.userId, meta, record.familyId);
  return { userId: record.userId, refreshToken: next };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Sign out everywhere: revoke refresh tokens and invalidate live access tokens. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
  ]);
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: `${env.basePath}/api/auth`,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: `${env.basePath}/api/auth` });
}
