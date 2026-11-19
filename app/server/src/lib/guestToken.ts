/**
 * Signed links for people who booked WITHOUT an account.
 *
 * A guest can't sign in, so each of their emails carries a link to
 * /booking/<id>?t=<token> where they can see the session, find the Meet link and
 * cancel. The token is an HMAC of the booking id, so it needs no storage, cannot
 * be guessed, and only unlocks that one booking.
 *
 * It is derived from JWT_ACCESS_SECRET: rotating that secret invalidates old
 * guest links (signed-in users are unaffected).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

export function guestToken(bookingId: string): string {
  return createHmac('sha256', env.JWT_ACCESS_SECRET).update(`guest-booking:${bookingId}`).digest('base64url');
}

export function verifyGuestToken(bookingId: string, token: unknown): boolean {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return false;
  const expected = Buffer.from(guestToken(bookingId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const guestManageUrl = (bookingId: string): string => `${env.APP_URL}/booking/${bookingId}?t=${guestToken(bookingId)}`;
