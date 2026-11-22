/**
 * Minimal iCalendar (RFC 5545) writer for session invites and personal calendar feeds.
 * Times are written in UTC, text is escaped, and long lines are folded at 75 octets,
 * which is what Google Calendar, Apple Calendar and Outlook all expect.
 */

export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  url?: string;
  location?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  /** Bump when the event changes so calendars replace their copy. */
  sequence?: number;
  updated?: Date;
}

export const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line to 75 octets (continuation lines start with a space). */
export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    const limit = parts.length === 0 ? 75 : 74; // continuation lines lose one octet to the leading space
    if (size + n > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MindAccel Tutoring//Sessions//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(e.updated ?? now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      `STATUS:${e.status ?? 'CONFIRMED'}`,
      `SEQUENCE:${e.sequence ?? 0}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
