/**
 * Pure rules for messaging, kept free of I/O so they are unit-tested
 * (messaging.policy.test.ts) and shared by the service.
 */

export type Side = 'student' | 'tutor';

export interface ConversationSides {
  studentId: string;
  tutorId: string;
}

/** Which side of a thread the user is on, or null if they are not in it. */
export function sideOf(c: ConversationSides, userId: string): Side | null {
  if (c.studentId === userId) return 'student';
  if (c.tutorId === userId) return 'tutor';
  return null;
}

export const otherSide = (s: Side): Side => (s === 'student' ? 'tutor' : 'student');

/**
 * Email the recipient about a new message?
 *  - a tutor's question about a session: always (it is time-sensitive)
 *  - otherwise: once per unread streak, i.e. never emailed about this thread yet,
 *    or they have read it since the last email
 */
export function shouldEmail(input: { kind: 'MESSAGE' | 'QUESTION'; notifiedAt: Date | null; lastReadAt: Date | null }): boolean {
  if (input.kind === 'QUESTION') return true;
  if (!input.notifiedAt) return true;
  return !!input.lastReadAt && input.lastReadAt >= input.notifiedAt;
}

/** Short, single-paragraph preview for emails and the conversation list. */
export function preview(body: string, max = 280): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Bookings a tutor may ask a question about: theirs, still upcoming, not cancelled. */
export function canAskAbout(b: { tutorId: string; status: string; endsAt: Date }, tutorId: string, now = new Date()): boolean {
  return b.tutorId === tutorId && (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.endsAt > now;
}
