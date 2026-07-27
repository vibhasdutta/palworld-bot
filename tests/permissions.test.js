const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTier, hasAccess, findGuildRoles } = require('../src/permissions');

const guilds = [
  {
    guildId: 'G1',
    admin: { roleIds: ['A'], userIds: ['ADMIN_USER'] },
    operator: { roleIds: ['B'], userIds: ['OP_USER'] },
  },
  {
    guildId: 'G2',
    admin: { roleIds: ['A2'], userIds: [] },
    operator: { roleIds: [], userIds: [] },
  },
];

test('findGuildRoles returns the matching guild entry', () => {
  assert.equal(findGuildRoles(guilds, 'G2').guildId, 'G2');
});

test('findGuildRoles returns null for an unconfigured guild', () => {
  assert.equal(findGuildRoles(guilds, 'UNKNOWN'), null);
});

const g1 = findGuildRoles(guilds, 'G1');

test('resolveTier returns admin when member has that guild\'s admin role', () => {
  assert.equal(resolveTier({ roleIds: ['A', 'X'], userId: 'nobody' }, g1), 'admin');
});

test('resolveTier returns admin when member ID is individually listed as admin', () => {
  assert.equal(resolveTier({ roleIds: [], userId: 'ADMIN_USER' }, g1), 'admin');
});

test('resolveTier returns operator when member has only an operator role', () => {
  assert.equal(resolveTier({ roleIds: ['B'], userId: 'nobody' }, g1), 'operator');
});

test('resolveTier returns operator when member ID is individually listed as operator', () => {
  assert.equal(resolveTier({ roleIds: [], userId: 'OP_USER' }, g1), 'operator');
});

test('resolveTier returns null when member matches neither roles nor user IDs', () => {
  assert.equal(resolveTier({ roleIds: ['X'], userId: 'nobody' }, g1), null);
});

test('resolveTier returns null when the guild has no config (bot in an unconfigured server)', () => {
  assert.equal(resolveTier({ roleIds: ['A'], userId: 'ADMIN_USER' }, null), null);
});

test('a role/user from one guild does not grant access in another guild', () => {
  const g2 = findGuildRoles(guilds, 'G2');
  assert.equal(resolveTier({ roleIds: ['A'], userId: 'ADMIN_USER' }, g2), null);
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
