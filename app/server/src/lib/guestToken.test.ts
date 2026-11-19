import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestManageUrl, guestToken, verifyGuestToken } from './guestToken.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('a token unlocks only its own booking', () => {
  assert.equal(verifyGuestToken(A, guestToken(A)), true);
  assert.equal(verifyGuestToken(B, guestToken(A)), false);
});

test('tampered, empty and non-string tokens are refused', () => {
  const t = guestToken(A);
  assert.equal(verifyGuestToken(A, t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')), false);
  assert.equal(verifyGuestToken(A, ''), false);
  assert.equal(verifyGuestToken(A, undefined), false);
  assert.equal(verifyGuestToken(A, ['x']), false);
  assert.equal(verifyGuestToken(A, 'x'.repeat(500)), false);
});

test('the manage link points at the public booking page', () => {
  const url = guestManageUrl(A);
  assert.ok(url.startsWith('https://app.example.test/booking/' + A + '?t='));
  assert.equal(new URL(url).searchParams.get('t'), guestToken(A));
});
