const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadRolesFile, loadConfig } = require('../src/config');

test('loadRolesFile reads roleIds/userIds per tier and defaults missing fields to []', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify({ admin: { roleIds: ['1'] } }));

  const roles = loadRolesFile(rolesPath);

  assert.deepEqual(roles, {
    admin: { roleIds: ['1'], userIds: [] },
    operator: { roleIds: [], userIds: [] },
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadConfig reads secrets from env and applies defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify({
    admin: { roleIds: ['A'], userIds: ['U1'] },
    operator: { roleIds: ['B'], userIds: [] },
  }));

  const config = loadConfig({
    DISCORD_TOKEN: 'tok',
    DISCORD_CLIENT_ID: 'cid',
    DISCORD_GUILD_ID: 'gid',
    PALWORLD_ADMIN_PASSWORD: 'pw',
    ROLES_CONFIG_PATH: rolesPath,
  });

  assert.equal(config.discordToken, 'tok');
  assert.equal(config.restApiUrl, 'http://localhost:8212');
  assert.equal(config.systemdUnit, 'palworld.service');
  assert.deepEqual(config.roles, {
    admin: { roleIds: ['A'], userIds: ['U1'] },
    operator: { roleIds: ['B'], userIds: [] },
  });
  fs.rmSync(dir, { recursive: true, force: true });
});
