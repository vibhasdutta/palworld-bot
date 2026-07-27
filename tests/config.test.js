const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadGuildsFile, loadConfig } = require('../src/config');

test('loadGuildsFile reads each guild\'s roleIds/userIds per tier and defaults missing fields to []', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilds-'));
  const guildsPath = path.join(dir, 'guilds.json');
  fs.writeFileSync(guildsPath, JSON.stringify([
    { guildId: 'G1', admin: { roleIds: ['1'] } },
  ]));

  const guilds = loadGuildsFile(guildsPath);

  assert.deepEqual(guilds, [
    { guildId: 'G1', admin: { roleIds: ['1'], userIds: [] }, operator: { roleIds: [], userIds: [] } },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadGuildsFile supports multiple guilds', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilds-'));
  const guildsPath = path.join(dir, 'guilds.json');
  fs.writeFileSync(guildsPath, JSON.stringify([
    { guildId: 'G1', admin: { roleIds: ['A'] }, operator: { roleIds: ['B'] } },
    { guildId: 'G2', admin: { userIds: ['U1'] } },
  ]));

  const guilds = loadGuildsFile(guildsPath);

  assert.equal(guilds.length, 2);
  assert.equal(guilds[0].guildId, 'G1');
  assert.equal(guilds[1].guildId, 'G2');
  assert.deepEqual(guilds[1].admin, { roleIds: [], userIds: ['U1'] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadConfig reads secrets from env and applies defaults', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guilds-'));
  const guildsPath = path.join(dir, 'guilds.json');
  fs.writeFileSync(guildsPath, JSON.stringify([
    { guildId: 'G1', admin: { roleIds: ['A'] }, operator: { roleIds: ['B'] } },
  ]));

  const config = loadConfig({
    DISCORD_TOKEN: 'tok',
    DISCORD_CLIENT_ID: 'cid',
    PALWORLD_ADMIN_PASSWORD: 'pw',
    GUILDS_CONFIG_PATH: guildsPath,
  });

  assert.equal(config.discordToken, 'tok');
  assert.equal(config.restApiUrl, 'http://localhost:8212');
  assert.equal(config.systemdUnit, 'palworld.service');
  assert.equal(config.guilds.length, 1);
  assert.equal(config.guilds[0].guildId, 'G1');
  fs.rmSync(dir, { recursive: true, force: true });
});
