const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadGuildsFile,
  loadRolesFile,
  loadChannelsFile,
  ensureGuildEntry,
  mutateGuildRoles,
  loadConfig,
} = require('../src/config');

function tmpConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
}

test('loadGuildsFile returns just the guild registry', () => {
  const dir = tmpConfigDir();
  const guildsPath = path.join(dir, 'guilds.json');
  fs.writeFileSync(guildsPath, JSON.stringify([{ guildId: 'G1' }, { guildId: 'G2' }]));

  assert.deepEqual(loadGuildsFile(guildsPath), [{ guildId: 'G1' }, { guildId: 'G2' }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadGuildsFile returns [] when the file does not exist yet', () => {
  assert.deepEqual(loadGuildsFile(path.join(tmpConfigDir(), 'missing.json')), []);
});

test('loadRolesFile reads roleIds/userIds per tier and defaults missing fields to []', () => {
  const dir = tmpConfigDir();
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify([{ guildId: 'G1', admin: { roleIds: ['1'] } }]));

  assert.deepEqual(loadRolesFile(rolesPath), [
    { guildId: 'G1', admin: { roleIds: ['1'], userIds: [] }, operator: { roleIds: [], userIds: [] } },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadChannelsFile defaults missing channel IDs to null', () => {
  const dir = tmpConfigDir();
  const channelsPath = path.join(dir, 'channels.json');
  fs.writeFileSync(channelsPath, JSON.stringify([{ guildId: 'G1', botChannelId: '123' }]));

  assert.deepEqual(loadChannelsFile(channelsPath), [
    { guildId: 'G1', botChannelId: '123', serverChannelId: null },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ensureGuildEntry registers a new guild across all three files with empty defaults', () => {
  const dir = tmpConfigDir();
  const guildsPath = path.join(dir, 'guilds.json');
  const rolesPath = path.join(dir, 'roles.json');
  const channelsPath = path.join(dir, 'channels.json');

  const added = ensureGuildEntry(guildsPath, rolesPath, channelsPath, 'G1');

  assert.equal(added, true);
  assert.deepEqual(loadGuildsFile(guildsPath), [{ guildId: 'G1' }]);
  assert.deepEqual(loadRolesFile(rolesPath), [
    { guildId: 'G1', admin: { roleIds: [], userIds: [] }, operator: { roleIds: [], userIds: [] } },
  ]);
  assert.deepEqual(loadChannelsFile(channelsPath), [{ guildId: 'G1', botChannelId: null, serverChannelId: null }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ensureGuildEntry is a no-op for an already-registered guild', () => {
  const dir = tmpConfigDir();
  const guildsPath = path.join(dir, 'guilds.json');
  const rolesPath = path.join(dir, 'roles.json');
  const channelsPath = path.join(dir, 'channels.json');

  ensureGuildEntry(guildsPath, rolesPath, channelsPath, 'G1');
  const addedAgain = ensureGuildEntry(guildsPath, rolesPath, channelsPath, 'G1');

  assert.equal(addedAgain, false);
  assert.equal(loadGuildsFile(guildsPath).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutateGuildRoles adds to an existing guild\'s operator roleIds and persists it', () => {
  const dir = tmpConfigDir();
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify([
    { guildId: 'G1', admin: { roleIds: [], userIds: [] }, operator: { roleIds: [], userIds: [] } },
  ]));

  const entry = mutateGuildRoles(rolesPath, 'G1', (e) => e.operator.roleIds.push('R1'));

  assert.deepEqual(entry.operator.roleIds, ['R1']);
  assert.deepEqual(loadRolesFile(rolesPath)[0].operator.roleIds, ['R1']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('mutateGuildRoles creates the guild entry if it does not exist yet', () => {
  const dir = tmpConfigDir();
  const rolesPath = path.join(dir, 'roles.json');
  fs.writeFileSync(rolesPath, JSON.stringify([]));

  mutateGuildRoles(rolesPath, 'NEW', (e) => e.operator.userIds.push('U1'));

  assert.deepEqual(loadRolesFile(rolesPath), [
    { guildId: 'NEW', admin: { roleIds: [], userIds: [] }, operator: { roleIds: [], userIds: ['U1'] } },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadConfig reads secrets from env and wires up all three config paths', () => {
  const config = loadConfig({
    DISCORD_TOKEN: 'tok',
    DISCORD_CLIENT_ID: 'cid',
    PALWORLD_ADMIN_PASSWORD: 'pw',
    CONFIG_DIR: tmpConfigDir(),
  });

  assert.equal(config.discordToken, 'tok');
  assert.equal(config.restApiUrl, 'http://localhost:8212');
  assert.equal(config.pm2ProcessName, 'palworld');
  assert.deepEqual(config.guilds, []);
  assert.deepEqual(config.roles, []);
  assert.deepEqual(config.channels, []);
});
