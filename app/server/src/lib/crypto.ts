/**
 * Password hashing and opaque token helpers.
 *
 * - Passwords: Argon2id (OWASP-recommended), parameters below follow the
 *   OWASP Password Storage Cheat Sheet minimums with some headroom.
 * - Opaque tokens (refresh, password reset): 48 random bytes, base64url.
 *   Only a SHA-256 hash is stored, so a DB leak does not leak usable tokens.
 */
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTS);
}

export async function verifyPassword(hash: string | null, plain: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** A dummy hash used to keep login timing constant when the email is unknown. */
let dummyHash: string | null = null;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= await hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(dummyHash, plain);
}

export function generateOpaqueToken(): string {
  return randomBytes(48).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
