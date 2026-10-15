/**
 * SLOT ENGINE — pure functions, no database access (easy to unit-test).
 *
 * Inputs are a tutor's weekly rules (wall-clock times in the TUTOR's
 * timezone), one-off exceptions, and the intervals already taken. Output is a
 * list of bookable start times in UTC. The student's browser renders them in
 * the student's timezone, so a tutor in Chicago and a student in London both
 * see correct local times — including across DST changes, because each rule
 * is expanded per calendar date with Luxon rather than by adding fixed offsets.
 */
import { DateTime, Interval } from 'luxon';

export interface Rule {
  weekday: number; // 1=Mon .. 7=Sun
  startMinute: number;
  endMinute: number;
  timezone: string;
  effectiveFrom?: Date | null; // DATE (inclusive)
  effectiveTo?: Date | null; // DATE (inclusive)
}

export interface Exception {
  startsAt: Date;
  endsAt: Date;
  isAvailable: boolean;
}

export interface Busy {
  startsAt: Date;
  endsAt: Date; // for tutor bookings pass blockedUntil (session + buffer)
}

export interface SlotQuery {
  rules: Rule[];
  exceptions: Exception[];
  busy: Busy[];
  durationMinutes: number;
  bufferMinutes: number;
  from: Date;
  to: Date;
  now: Date;
  minLeadHours: number;
  maxHorizonDays: number;
  stepMinutes: number;
}

export interface Slot {
  startsAt: string; // ISO UTC
  endsAt: string;
}

/** Expand weekly rules into concrete UTC intervals overlapping [from, to). */
export function expandRules(rules: Rule[], from: Date, to: Date): Interval[] {
  const out: Interval[] = [];
  for (const rule of rules) {
    const zone = rule.timezone;
    // Walk local calendar days, padded by a day each side for zone offsets.
    let day = DateTime.fromJSDate(from, { zone }).startOf('day').minus({ days: 1 });
    const last = DateTime.fromJSDate(to, { zone }).startOf('day').plus({ days: 1 });

    for (; day <= last; day = day.plus({ days: 1 })) {
      if (day.weekday !== rule.weekday) continue;
      const isoDate = day.toISODate()!;
      if (rule.effectiveFrom && isoDate < rule.effectiveFrom.toISOString().slice(0, 10)) continue;
      if (rule.effectiveTo && isoDate > rule.effectiveTo.toISOString().slice(0, 10)) continue;

      const start = wallClock(day, rule.startMinute);
      const end = wallClock(day, rule.endMinute);
      const iv = Interval.fromDateTimes(start, end);
      if (iv.isValid && !iv.isEmpty()) out.push(iv);
    }
  }
  return out;
}

/** Build a DateTime for minute-of-day on a local date, DST-safe. */
function wallClock(day: DateTime, minuteOfDay: number): DateTime {
  if (minuteOfDay >= 1440) return day.plus({ days: 1 }).startOf('day');
  // Setting wall-clock fields (not adding a duration) keeps "9:00" at 9:00
  // on DST transition days. Non-existent times (spring-forward gap) are
  // shifted forward by Luxon, which is the sensible behaviour.
  return day.set({ hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60, second: 0, millisecond: 0 });
}

const toIv = (s: Date, e: Date) => Interval.fromDateTimes(DateTime.fromJSDate(s), DateTime.fromJSDate(e));

/** Rules + extra hours − blackouts, merged into non-overlapping windows. */
export function availableWindows(rules: Rule[], exceptions: Exception[], from: Date, to: Date): Interval[] {
  const base = expandRules(rules, from, to);
  const extra = exceptions.filter((e) => e.isAvailable).map((e) => toIv(e.startsAt, e.endsAt));
  const blackouts = exceptions.filter((e) => !e.isAvailable).map((e) => toIv(e.startsAt, e.endsAt));

  let windows = Interval.merge([...base, ...extra]);
  if (blackouts.length) windows = windows.flatMap((w) => w.difference(...blackouts));
  return windows;
}

export function computeSlots(q: SlotQuery): Slot[] {
  const earliest = new Date(Math.max(q.from.getTime(), q.now.getTime() + q.minLeadHours * 3_600_000));
  const latest = new Date(Math.min(q.to.getTime(), q.now.getTime() + q.maxHorizonDays * 86_400_000));
  if (earliest >= latest) return [];

  const windows = availableWindows(q.rules, q.exceptions, earliest, latest);
  const busy = q.busy.map((b) => [b.startsAt.getTime(), b.endsAt.getTime()] as const);
  const stepMs = q.stepMinutes * 60_000;
  const durMs = q.durationMinutes * 60_000;
  const blockMs = (q.durationMinutes + q.bufferMinutes) * 60_000;

  const slots: Slot[] = [];
  for (const w of windows) {
    const wStart = w.start!.toMillis();
    const wEnd = w.end!.toMillis();
    // First step-aligned start inside both the window and the query range.
    let t = Math.ceil(Math.max(wStart, earliest.getTime()) / stepMs) * stepMs;

    for (; t + durMs <= wEnd && t < latest.getTime(); t += stepMs) {
      const blockEnd = t + blockMs;
      const clash = busy.some(([bs, be]) => t < be && bs < blockEnd);
      if (!clash) slots.push({ startsAt: new Date(t).toISOString(), endsAt: new Date(t + durMs).toISOString() });
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
