/**
 * Run with:  npm test
 * Covers the tricky parts of the slot engine: timezones, DST, buffers, lead time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, type SlotQuery } from './slots.js';

const base = (over: Partial<SlotQuery>): SlotQuery => ({
  rules: [],
  exceptions: [],
  busy: [],
  durationMinutes: 60,
  bufferMinutes: 0,
  from: new Date('2026-11-02T00:00:00Z'),
  to: new Date('2026-11-03T00:00:00Z'),
  now: new Date('2026-10-01T00:00:00Z'),
  minLeadHours: 0,
  maxHorizonDays: 365,
  stepMinutes: 60,
  ...over,
});

test('expands a Chicago Monday 9–12 rule into UTC (CST = UTC-6 after DST ends)', () => {
  const slots = computeSlots(
    base({ rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60, timezone: 'America/Chicago' }] }),
  );
  assert.deepEqual(
    slots.map((s) => s.startsAt),
    ['2026-11-02T15:00:00.000Z', '2026-11-02T16:00:00.000Z', '2026-11-02T17:00:00.000Z'],
  );
});

test('keeps 9:00 local across the DST change (CDT = UTC-5 the week before)', () => {
  const slots = computeSlots(
    base({
      from: new Date('2026-10-26T00:00:00Z'),
      to: new Date('2026-10-27T00:00:00Z'),
      rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60, timezone: 'America/Chicago' }],
    }),
  );
  assert.deepEqual(slots.map((s) => s.startsAt), ['2026-10-26T14:00:00.000Z']);
});

test('busy bookings and buffers remove overlapping slots', () => {
  const slots = computeSlots(
    base({
      bufferMinutes: 15,
      stepMinutes: 15,
      rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60, timezone: 'America/Chicago' }],
      busy: [{ startsAt: new Date('2026-11-02T16:00:00Z'), endsAt: new Date('2026-11-02T17:15:00Z') }],
    }),
  );
  // Any start before 17:15 would (with its 15-min buffer) touch the busy block.
  // Window is 15:00–19:00 UTC, so 17:15 … 18:00 remain.
  assert.deepEqual(
    slots.map((s) => s.startsAt),
    ['2026-11-02T17:15:00.000Z', '2026-11-02T17:30:00.000Z', '2026-11-02T17:45:00.000Z', '2026-11-02T18:00:00.000Z'],
  );
});

test('blackout exceptions remove time; minimum lead time is enforced', () => {
  const slots = computeSlots(
    base({
      now: new Date('2026-11-02T14:30:00Z'),
      minLeadHours: 1,
      rules: [{ weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60, timezone: 'America/Chicago' }],
      exceptions: [{ startsAt: new Date('2026-11-02T17:00:00Z'), endsAt: new Date('2026-11-02T18:00:00Z'), isAvailable: false }],
    }),
  );
  assert.deepEqual(slots.map((s) => s.startsAt), ['2026-11-02T16:00:00.000Z', '2026-11-02T18:00:00.000Z']);
});

test('spring-forward gap: a rule at 02:30 on DST day does not crash and lands after the gap', () => {
  // 2027-03-14 is the US spring-forward Sunday; 02:00–03:00 local does not exist.
  const slots = computeSlots(
    base({
      from: new Date('2027-03-14T00:00:00Z'),
      to: new Date('2027-03-15T00:00:00Z'),
      rules: [{ weekday: 7, startMinute: 2 * 60 + 30, endMinute: 5 * 60, timezone: 'America/Chicago' }],
    }),
  );
  assert.ok(slots.length >= 1);
  for (const s of slots) assert.ok(new Date(s.startsAt) >= new Date('2027-03-14T08:00:00Z')); // 03:00 CDT
});

test('a rule ending at midnight (endMinute 1440) produces the last evening slot', () => {
  const slots = computeSlots(
    base({ rules: [{ weekday: 1, startMinute: 22 * 60, endMinute: 1440, timezone: 'UTC' }] }),
  );
  assert.deepEqual(slots.map((s) => s.startsAt), ['2026-11-02T22:00:00.000Z', '2026-11-02T23:00:00.000Z']);
});

test('effectiveFrom/effectiveTo limit a rule to a date range', () => {
  const rule = { weekday: 1, startMinute: 600, endMinute: 660, timezone: 'UTC' };
  const q = { from: new Date('2026-11-02T00:00:00Z'), to: new Date('2026-11-17T00:00:00Z') };
  const all = computeSlots(base({ ...q, rules: [rule] }));
  assert.equal(all.length, 3); // Nov 2, 9, 16
  const limited = computeSlots(base({ ...q, rules: [{ ...rule, effectiveFrom: new Date('2026-11-05'), effectiveTo: new Date('2026-11-12') }] }));
  assert.deepEqual(limited.map((s) => s.startsAt), ['2026-11-09T10:00:00.000Z']);
});

test('extra-hours exceptions add availability outside the weekly template', () => {
  const slots = computeSlots(
    base({ exceptions: [{ startsAt: new Date('2026-11-02T08:00:00Z'), endsAt: new Date('2026-11-02T10:00:00Z'), isAvailable: true }] }),
  );
  assert.deepEqual(slots.map((s) => s.startsAt), ['2026-11-02T08:00:00.000Z', '2026-11-02T09:00:00.000Z']);
});

test('tutor in Tokyo: Monday 08:00 JST is Sunday 23:00 UTC (calendar day differs from UTC)', () => {
  const slots = computeSlots(
    base({
      from: new Date('2026-11-01T00:00:00Z'), // Sunday UTC
      to: new Date('2026-11-02T00:00:00Z'),
      rules: [{ weekday: 1, startMinute: 8 * 60, endMinute: 9 * 60, timezone: 'Asia/Tokyo' }],
    }),
  );
  assert.deepEqual(slots.map((s) => s.startsAt), ['2026-11-01T23:00:00.000Z']);
});

test('maximum horizon is enforced', () => {
  const slots = computeSlots(
    base({
      now: new Date('2026-11-01T00:00:00Z'),
      maxHorizonDays: 1,
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-11-10T00:00:00Z'),
      rules: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 600, endMinute: 660, timezone: 'UTC' })),
    }),
  );
  assert.deepEqual(slots.map((s) => s.startsAt), ['2026-11-01T10:00:00.000Z']);
});
