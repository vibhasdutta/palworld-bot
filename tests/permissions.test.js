const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTier, hasAccess } = require('../src/permissions');

const roles = {
  admin: { roleIds: ['A'], userIds: ['ADMIN_USER'] },
  operator: { roleIds: ['B'], userIds: ['OP_USER'] },
};

test('resolveTier returns admin when member has an admin role', () => {
  assert.equal(resolveTier({ roleIds: ['A', 'X'], userId: 'nobody' }, roles), 'admin');
});

test('resolveTier returns admin when member ID is individually listed as admin', () => {
  assert.equal(resolveTier({ roleIds: [], userId: 'ADMIN_USER' }, roles), 'admin');
});

test('resolveTier returns operator when member has only an operator role', () => {
  assert.equal(resolveTier({ roleIds: ['B'], userId: 'nobody' }, roles), 'operator');
});

test('resolveTier returns operator when member ID is individually listed as operator', () => {
  assert.equal(resolveTier({ roleIds: [], userId: 'OP_USER' }, roles), 'operator');
});

test('resolveTier returns null when member matches neither roles nor user IDs', () => {
  assert.equal(resolveTier({ roleIds: ['X'], userId: 'nobody' }, roles), null);
});

test('hasAccess: admin can use operator-tier commands', () => {
  assert.equal(hasAccess('admin', 'operator'), true);
});

test('hasAccess: operator cannot use admin-tier commands', () => {
  assert.equal(hasAccess('operator', 'admin'), false);
});

test('hasAccess: no tier is always denied', () => {
  assert.equal(hasAccess(null, 'operator'), false);
});
