import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, defaultSettings, emailDomainAllowed, resolveSettings, SettingsPatchSchema, SettingsSchema } from './model.js';

test('defaults keep the behaviour of earlier versions', () => {
  const d = defaultSettings();
  assert.equal(d.registration.open, true);
  assert.equal(d.registration.requireApproval, true);
  assert.equal(d.booking.requireAccount, true);
  assert.equal(d.maintenance.enabled, false);
  assert.ok(SettingsSchema.safeParse(d).success);
});

test('saved values override defaults; missing fields keep defaults', () => {
  const s = resolveSettings({ registration: { requireApproval: false }, booking: { requireAccount: false } });
  assert.equal(s.registration.requireApproval, false);
  assert.equal(s.registration.open, true);
  assert.equal(s.booking.requireAccount, false);
  assert.equal(s.booking.slotStepMinutes, defaultSettings().booking.slotStepMinutes);
});

test('a damaged section falls back to defaults without touching the others', () => {
  const s = resolveSettings({ registration: { requireApproval: false }, booking: { minLeadHours: 'lots', maxHorizonDays: -4 } });
  assert.equal(s.registration.requireApproval, false);
  assert.deepEqual(s.booking, defaultSettings().booking);
});

test('garbage input never throws', () => {
  for (const junk of [null, undefined, 5, 'x', [], { registration: 7 }]) {
    assert.deepEqual(resolveSettings(junk), defaultSettings());
  }
});

test('patches merge field by field', () => {
  const base = defaultSettings();
  const next = applyPatch(base, { registration: { allowedEmailDomains: ['school.org'] }, maintenance: { enabled: true } });
  assert.deepEqual(next.registration.allowedEmailDomains, ['school.org']);
  assert.equal(next.registration.requireApproval, true);
  assert.equal(next.maintenance.enabled, true);
  assert.equal(next.maintenance.message, base.maintenance.message);
  assert.equal(base.maintenance.enabled, false, 'the original is not mutated');
});

test('patch validation rejects bad domains and out-of-range numbers', () => {
  assert.ok(!SettingsPatchSchema.safeParse({ registration: { allowedEmailDomains: ['@school.org'] } }).success);
  assert.ok(!SettingsPatchSchema.safeParse({ registration: { allowedEmailDomains: ['nodot'] } }).success);
  assert.ok(!SettingsPatchSchema.safeParse({ booking: { slotStepMinutes: 1 } }).success);
  assert.ok(!SettingsPatchSchema.safeParse({ booking: { maxHorizonDays: 0 } }).success);
  const ok = SettingsPatchSchema.safeParse({ registration: { allowedEmailDomains: ['School.ORG '] } });
  assert.ok(ok.success);
  assert.deepEqual(ok.data?.registration?.allowedEmailDomains, ['school.org'], 'domains are normalised');
});

test('email domain allow-list', () => {
  assert.equal(emailDomainAllowed('a@anything.com', []), true);
  assert.equal(emailDomainAllowed('a@school.org', ['school.org']), true);
  assert.equal(emailDomainAllowed('A@SCHOOL.ORG', ['school.org']), true);
  assert.equal(emailDomainAllowed('a@evil-school.org', ['school.org']), false);
  assert.equal(emailDomainAllowed('a@sub.school.org', ['school.org']), false, 'subdomains must be listed explicitly');
  assert.equal(emailDomainAllowed('a@school.org.evil.com', ['school.org']), false);
});
