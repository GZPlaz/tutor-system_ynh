/**
 * The API always speaks UTC ISO strings. These helpers render them in the
 * viewer's timezone (profile timezone, falling back to the browser's) and
 * convert wall-clock input in a given timezone back to UTC — without a
 * date library, using the Intl API every modern browser ships.
 */
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function fmtDateTime(iso: string | Date, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(iso));
}

export function fmtDate(iso: string | Date, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone }).format(new Date(iso));
}

export function fmtTime(iso: string | Date, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** Group items by the viewer's local calendar day. */
export function groupByDay<T extends { startsAt: string }>(items: T[], timeZone?: string) {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', timeZone });
  const map = new Map<string, T[]>();
  for (const it of items) {
    const key = fmt.format(new Date(it.startsAt));
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return [...map.entries()];
}

/** All IANA zones the browser knows (for timezone pickers). */
export const allTimeZones = (): string[] =>
  (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [browserTimeZone()];

/** Offset (ms) of `timeZone` from UTC at the instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * "2026-11-02" + "09:30" in "America/Chicago" → UTC Date.
 * Two passes make it correct on DST-transition days.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - zoneOffsetMs(wall, timeZone);
  utc = wall - zoneOffsetMs(utc, timeZone);
  return new Date(utc);
}

/** "HH:MM" ↔ minutes since midnight (availability rules). */
export const minutesToHHMM = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function fmtMoney(cents: number | null | undefined, currency = 'USD') {
  if (cents == null) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export function fmtBytes(n: number | null | undefined) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i ? 1 : 0)} ${u[i]}`;
}
