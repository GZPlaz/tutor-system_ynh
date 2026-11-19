/**
 * BOOKING RULES — the single source of truth for "who may do what, when" on
 * a booking. Pure function (no DB), unit-tested in bookingRules.test.ts.
 *
 * The API uses it to authorise every action, and returns the result to the
 * UI as `actions`, so buttons only appear when the server will accept them.
 *
 *   PENDING ──confirm──▶ CONFIRMED ──start──▶ (live) ──end──▶ COMPLETED
 *      │                    │                    (end works early too)
 *      └──decline──▶ DECLINED   ├──cancel──▶ CANCELLED (before it starts)
 *                               └──no-show──▶ NO_SHOW  (after start time, never started)
 */
import { P } from '../rbac/permissions.js';

export interface BookingState {
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'DECLINED';
  studentId: string;
  tutorId: string;
  startsAt: Date;
  endsAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface Actor {
  userId: string;
  can(permission: string): boolean;
}

export interface BookingActions {
  confirm: boolean;
  decline: boolean;
  start: boolean;
  end: boolean;
  noShow: boolean;
  postLink: boolean;
  cancel: boolean;
  /** Student is inside the cancellation cutoff (UI explains instead of offering Cancel). */
  cancelTooLate: boolean;
}

export function bookingActions(b: BookingState, a: Actor, now: Date, studentCancelCutoffHours: number): BookingActions {
  const isTutor = b.tutorId === a.userId;
  const isStudent = b.studentId === a.userId;
  const staff = a.can(P.BOOKINGS_MANAGE_ANY);
  const runs = staff || (isTutor && a.can(P.SESSIONS_RUN));
  const started = !!b.startedAt;
  const ended = !!b.endedAt;
  const confirmed = b.status === 'CONFIRMED';
  const pending = b.status === 'PENDING';

  const mayCancel = staff || ((isTutor || isStudent) && a.can(P.BOOKINGS_CANCEL_OWN));
  const withinCutoff = now.getTime() > b.startsAt.getTime() - studentCancelCutoffHours * 3_600_000;
  // Students can always withdraw an unconfirmed request; confirmed sessions respect the cutoff.
  const cutoffApplies = !staff && !isTutor && isStudent && confirmed && withinCutoff;

  return {
    confirm: runs && pending && now < b.endsAt,
    decline: runs && pending,
    start: runs && confirmed && !started,
    end: runs && confirmed && !ended && (started || now >= b.startsAt),
    noShow: runs && confirmed && !started && now >= b.startsAt,
    postLink: (staff || (isTutor && a.can(P.SESSIONS_POST_LINK))) && confirmed && !ended,
    cancel: mayCancel && (pending || confirmed) && !started && !cutoffApplies,
    cancelTooLate: mayCancel && cutoffApplies && !started,
  };
}
