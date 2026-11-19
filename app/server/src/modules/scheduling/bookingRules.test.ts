import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingActions, type BookingState } from './bookingRules.js';
import { SYSTEM_ROLES } from '../rbac/permissions.js';

const actor = (userId: string, perms: readonly string[]) => ({ userId, can: (p: string) => perms.includes(p) });
const tutor = actor('tutor', SYSTEM_ROLES.tutor.permissions);
const student = actor('student', SYSTEM_ROLES.student.permissions);
const admin = actor('admin', SYSTEM_ROLES.admin.permissions);
const stranger = actor('someone', SYSTEM_ROLES.tutor.permissions);

const T0 = new Date('2026-11-02T15:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const booking = (over: Partial<BookingState> = {}): BookingState => ({
  status: 'PENDING', studentId: 'student', tutorId: 'tutor', startsAt: T0, endsAt: at(60), startedAt: null, endedAt: null, ...over,
});
const actions = (b: BookingState, who = tutor, now = at(-48 * 60)) => bookingActions(b, who, now, 24);

test('a new request can be confirmed or declined by its tutor only', () => {
  assert.equal(actions(booking()).confirm, true);
  assert.equal(actions(booking()).decline, true);
  assert.equal(actions(booking(), student).confirm, false);
  assert.equal(actions(booking(), stranger).confirm, false);
  assert.equal(actions(booking(), admin).confirm, true); // staff can act on anyone's
});

test('the Meet link can be posted any time after confirming — even days ahead', () => {
  assert.equal(actions(booking({ status: 'CONFIRMED' }), tutor, at(-7 * 24 * 60)).postLink, true);
  assert.equal(actions(booking()).postLink, false); // confirm first
  assert.equal(actions(booking({ status: 'CONFIRMED', endedAt: at(30), startedAt: at(0) })).postLink, false);
});

test('tutors can start early and end early', () => {
  const confirmed = booking({ status: 'CONFIRMED' });
  assert.equal(actions(confirmed, tutor, at(-20)).start, true); // 20 min early
  assert.equal(actions(confirmed, tutor, at(-20)).end, false); // can't end what hasn't begun
  const live = booking({ status: 'CONFIRMED', startedAt: at(-20) });
  assert.equal(actions(live, tutor, at(15)).end, true); // ending 45 min early
  assert.equal(actions(live, tutor, at(15)).start, false);
  assert.equal(actions(live, student, at(15)).end, false);
});

test('students may withdraw a pending request any time, but confirmed sessions respect the cutoff', () => {
  assert.equal(actions(booking(), student, at(-60)).cancel, true);
  const confirmed = booking({ status: 'CONFIRMED' });
  assert.equal(actions(confirmed, student, at(-48 * 60)).cancel, true);
  assert.equal(actions(confirmed, student, at(-60)).cancel, false);
  assert.equal(actions(confirmed, student, at(-60)).cancelTooLate, true);
  assert.equal(actions(confirmed, tutor, at(-60)).cancel, true); // tutors aren't bound by the cutoff
});

test('a started session cannot be cancelled; no-show only after start time without starting', () => {
  const live = booking({ status: 'CONFIRMED', startedAt: at(0) });
  assert.equal(actions(live, admin, at(10)).cancel, false);
  assert.equal(actions(booking({ status: 'CONFIRMED' }), tutor, at(-5)).noShow, false);
  assert.equal(actions(booking({ status: 'CONFIRMED' }), tutor, at(10)).noShow, true);
});

test('finished, declined and cancelled bookings offer no actions', () => {
  for (const status of ['COMPLETED', 'DECLINED', 'CANCELLED', 'NO_SHOW'] as const) {
    const a = actions(booking({ status }), admin, at(-60));
    assert.ok(Object.values(a).every((v) => v === false), status);
  }
});

test('every new request goes straight to the tutor; the student can withdraw it', () => {
  const s = actions(booking(), student);
  assert.equal(s.cancel, true);
  assert.equal(s.confirm, false);
  assert.equal(actions(booking(), tutor).confirm, true);
  assert.ok(!('pay' in s), 'there is no payment step any more');
});
