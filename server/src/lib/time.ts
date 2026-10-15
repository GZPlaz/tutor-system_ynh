/**
 * Timezone helpers. Rule of thumb for the whole codebase:
 *   - The database and API speak UTC ISO-8601 strings.
 *   - Conversion to a human's wall clock happens only for display (emails,
 *     UI) and when expanding a tutor's weekly availability (slots.service.ts).
 */
import { DateTime, IANAZone } from 'luxon';

export function isValidTimeZone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

/** "Tue, Nov 4, 2026, 3:00 PM CST" in the recipient's timezone. */
export function formatForUser(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: timezone }).toLocaleString({
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addHours(date: Date, hours: number): Date {
  return addMinutes(date, hours * 60);
}

/** True when [aStart,aEnd) and [bStart,bEnd) overlap. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
