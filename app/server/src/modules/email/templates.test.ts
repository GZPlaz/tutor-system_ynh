import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, templates } from './templates.js';

test('every template renders subject, html and text', () => {
  const payload = {
    firstName: 'Ana', studentName: 'Ana Ruiz', studentEmail: 'ana@example.com', reason: 'Full',
    token: 'tok', roleName: 'Tutor', expiresInHours: 72, expiresInMinutes: 60, serviceName: 'SAT Math',
    otherPartyName: 'Sam Lee', when: 'Mon, Nov 2, 9:00 AM CST', cancelledByName: 'Sam Lee', leadLabel: 'in about an hour',
    tutorName: 'Sam Lee', meetingUrl: 'https://meet.google.com/abc-defg-hij', notes: 'Quadratics please',
  };
  for (const key of Object.keys(templates)) {
    const r = render(key, payload);
    assert.ok(r.subject.length > 0, key);
    assert.match(r.html, /<html>/, key);
    assert.ok(r.text.length > 0, key);
  }
});

test('user-supplied values are HTML-escaped', () => {
  const r = render('registration_received', { firstName: '<script>alert(1)</script>' });
  assert.ok(!r.html.includes('<script>'));
  assert.ok(r.html.includes('&lt;script&gt;'));
});

test('apostrophes in names are not double-escaped', () => {
  const r = render('account_approved', { firstName: "Siobhán O'Brien" });
  assert.ok(r.html.includes('Siobhán O&#39;Brien'));
  assert.ok(!r.html.includes('&amp;#39;'));
});

test('links point at APP_URL', () => {
  const r = render('account_approved', { firstName: 'Ana' });
  assert.ok(r.html.includes('https://app.example.test/login'));
});

test('branding is applied: site name, colour and logo', () => {
  const r = render('account_approved', { firstName: 'Ana' }, { siteName: 'Bright Minds', color: '#123456', logoUrl: 'https://x.test/logo.png' });
  assert.match(r.subject, /Bright Minds/);
  assert.ok(r.html.includes('#123456'));
  assert.ok(r.html.includes('https://x.test/logo.png'));
});

test('tutor request email includes the student note, escaped', () => {
  const r = render('booking_request', { serviceName: 'SAT', when: 'Mon', studentName: 'Ana', notes: '<b>help</b>' });
  assert.ok(r.html.includes('&lt;b&gt;help&lt;/b&gt;'));
});

test('unknown template throws', () => {
  assert.throws(() => render('nope', {}));
});
