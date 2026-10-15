import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PERMISSION_KEYS, PERMISSIONS, SYSTEM_ROLES } from './permissions.js';

test('permission keys are unique and well-formed', () => {
  assert.equal(new Set(ALL_PERMISSION_KEYS).size, ALL_PERMISSION_KEYS.length);
  for (const k of ALL_PERMISSION_KEYS) assert.match(k, /^[a-z]+:[a-z_]+$/);
});

test('system roles only reference catalog permissions', () => {
  for (const [role, def] of Object.entries(SYSTEM_ROLES)) {
    for (const p of def.permissions) assert.ok(ALL_PERMISSION_KEYS.includes(p), `${role} → ${p}`);
  }
});

test('admin gets everything; students cannot approve or manage roles', () => {
  assert.equal(SYSTEM_ROLES.admin.permissions.length, Object.keys(PERMISSIONS).length);
  const student = SYSTEM_ROLES.student.permissions as readonly string[];
  assert.ok(!student.includes('users:approve'));
  assert.ok(!student.includes('roles:manage'));
});
