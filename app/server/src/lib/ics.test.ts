import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, fold, icsDate, icsText } from './ics.js';
import { csvField, toCsv } from './csv.js';

test('ics dates are UTC basic format', () => {
  assert.equal(icsDate(new Date('2026-11-24T19:00:00.000Z')), '20261124T190000Z');
});

test('ics text escapes special characters', () => {
  assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
});

test('long lines fold at 75 octets, including multi-byte characters', () => {
  const folded = fold('DESCRIPTION:' + 'é'.repeat(80));
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), 'DESCRIPTION:' + 'é'.repeat(80));
});

test('calendar has one event per session with CRLF line endings', () => {
  const ics = buildCalendar('My sessions', [
    { uid: 'a@x', start: new Date('2026-01-01T10:00:00Z'), end: new Date('2026-01-01T11:00:00Z'), summary: 'ACT Math, with Tina', status: 'TENTATIVE' },
  ]);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('SUMMARY:ACT Math\\, with Tina\r\n'));
  assert.ok(ics.includes('STATUS:TENTATIVE'));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
});

test('csv quotes and neutralises formulas', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvField('-5'), "'-5");
  assert.equal(csvField(null), '');
  assert.ok(toCsv(['a'], [[1]]).startsWith('\uFEFFa\r\n1'));
});
