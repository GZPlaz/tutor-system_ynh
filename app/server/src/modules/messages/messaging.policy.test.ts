import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAskAbout, otherSide, preview, shouldEmail, sideOf } from './messaging.policy.js';

const conv = { studentId: 's1', tutorId: 't1' };

test('sideOf identifies participants and rejects outsiders', () => {
  assert.equal(sideOf(conv, 's1'), 'student');
  assert.equal(sideOf(conv, 't1'), 'tutor');
  assert.equal(sideOf(conv, 'x'), null);
  assert.equal(otherSide('student'), 'tutor');
});

test('emails once per unread streak, but always for questions', () => {
  const t0 = new Date('2026-01-01T10:00:00Z');
  const t1 = new Date('2026-01-01T11:00:00Z');
  assert.equal(shouldEmail({ kind: 'MESSAGE', notifiedAt: null, lastReadAt: null }), true);
  assert.equal(shouldEmail({ kind: 'MESSAGE', notifiedAt: t1, lastReadAt: null }), false);
  assert.equal(shouldEmail({ kind: 'MESSAGE', notifiedAt: t1, lastReadAt: t0 }), false); // read before the last email
  assert.equal(shouldEmail({ kind: 'MESSAGE', notifiedAt: t0, lastReadAt: t1 }), true); // read since
  assert.equal(shouldEmail({ kind: 'QUESTION', notifiedAt: t1, lastReadAt: null }), true);
});

test('preview flattens whitespace and truncates', () => {
  assert.equal(preview('  hi\n\nthere  '), 'hi there');
  const long = preview('a'.repeat(400), 10);
  assert.equal(long.length, 10);
  assert.ok(long.endsWith('…'));
});

test('tutors can only ask about their own upcoming, active sessions', () => {
  const now = new Date('2026-01-01T10:00:00Z');
  const later = new Date('2026-01-02T10:00:00Z');
  const earlier = new Date('2025-12-31T10:00:00Z');
  assert.equal(canAskAbout({ tutorId: 't1', status: 'CONFIRMED', endsAt: later }, 't1', now), true);
  assert.equal(canAskAbout({ tutorId: 't1', status: 'PENDING', endsAt: later }, 't1', now), true);
  assert.equal(canAskAbout({ tutorId: 't2', status: 'CONFIRMED', endsAt: later }, 't1', now), false);
  assert.equal(canAskAbout({ tutorId: 't1', status: 'CANCELLED', endsAt: later }, 't1', now), false);
  assert.equal(canAskAbout({ tutorId: 't1', status: 'CONFIRMED', endsAt: earlier }, 't1', now), false);
});
