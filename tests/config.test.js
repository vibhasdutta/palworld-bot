const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadGuildsFile,
  loadRolesFile,
  loadChannelsFile,
  loadServersFile,
  findGuildServer,
  findGuildServers,
  readIniOptionSettings,
  resolveServerConnection,
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

test('loadServersFile parses a guild\'s server list and defaults missing fields to null', () => {
  const dir = tmpConfigDir();
  const serversPath = path.join(dir, 'servers.json');
  fs.writeFileSync(serversPath, JSON.stringify([
    { guildId: 'G1', servers: [{ label: 'main', restApiUrl: 'http://localhost:8212' }] },
  ]));

  assert.deepEqual(loadServersFile(serversPath), [
    { guildId: 'G1', servers: [{ label: 'main', restApiUrl: 'http://localhost:8212', restApiPassword: null, pm2ProcessName: null, saveFilePath: null, settingsFilePath: null }] },
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('loadServersFile defaults servers to [] when missing or malformed', () => {
  const dir = tmpConfigDir();
  const serversPath = path.join(dir, 'servers.json');
  fs.writeFileSync(serversPath, JSON.stringify([{ guildId: 'G1' }]));

  assert.deepEqual(loadServersFile(serversPath), [{ guildId: 'G1', servers: [] }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

const complete = (label, name) => ({ label, restApiUrl: `http://localhost:${name}`, restApiPassword: 'pw', pm2ProcessName: name, saveFilePath: null });

test('findGuildServers returns only complete servers for that guild', () => {
  const servers = [
    {
      guildId: 'G1',
      servers: [complete('main', 'palworld'), { label: 'incomplete', restApiUrl: '', restApiPassword: '', pm2ProcessName: '' }],
    },
  ];
  assert.deepEqual(findGuildServers(servers, 'G1'), [complete('main', 'palworld')]);
});

test('findGuildServers returns [] for an unregistered guild', () => {
  assert.deepEqual(findGuildServers([], 'G1'), []);
});

test('findGuildServer with no label auto-picks the only server when there\'s exactly one', () => {
  const servers = [{ guildId: 'G1', servers: [complete('main', 'palworld')] }];
  assert.deepEqual(findGuildServer(servers, 'G1'), complete('main', 'palworld'));
});

test('findGuildServer with no label returns null when a guild has zero servers', () => {
  assert.equal(findGuildServer([{ guildId: 'G1', servers: [] }], 'G1'), null);
});

test('findGuildServer with no label returns null when a guild has multiple servers (ambiguous)', () => {
  const servers = [{ guildId: 'G1', servers: [complete('main', 'palworld'), complete('pvp', 'palworld2')] }];
  assert.equal(findGuildServer(servers, 'G1'), null);
});

test('findGuildServer with a label returns the matching server even among several', () => {
  const servers = [{ guildId: 'G1', servers: [complete('main', 'palworld'), complete('pvp', 'palworld2')] }];
  assert.deepEqual(findGuildServer(servers, 'G1', 'pvp'), complete('pvp', 'palworld2'));
});

test('findGuildServer with an unknown label returns null', () => {
  const servers = [{ guildId: 'G1', servers: [complete('main', 'palworld')] }];
  assert.equal(findGuildServer(servers, 'G1', 'nope'), null);
});

test('findGuildServers treats a settingsFilePath-only server (no restApiUrl/restApiPassword) as complete', () => {
  const server = { label: 'main', pm2ProcessName: 'palworld', settingsFilePath: '/x/PalWorldSettings.ini', restApiUrl: null, restApiPassword: null, saveFilePath: null };
  const servers = [{ guildId: 'G1', servers: [server] }];
  assert.deepEqual(findGuildServers(servers, 'G1'), [server]);
});

test('readIniOptionSettings extracts AdminPassword and RESTAPIPort from the ini\'s OptionSettings line', () => {
  const iniContent = 'OptionSettings=(Difficulty=None,AdminPassword="secret123",PublicPort=8211,RESTAPIEnabled=True,RESTAPIPort=8212)';
  const result = readIniOptionSettings('/fake/PalWorldSettings.ini', () => iniContent);
  assert.deepEqual(result, { restApiPassword: 'secret123', restApiPort: '8212' });
});

test('readIniOptionSettings returns an empty password (not null) when AdminPassword="" in the ini', () => {
  const iniContent = 'OptionSettings=(AdminPassword="",RESTAPIPort=8212)';
  const result = readIniOptionSettings('/fake/PalWorldSettings.ini', () => iniContent);
  assert.equal(result.restApiPassword, '');
});

test('readIniOptionSettings returns null if the file can\'t be read', () => {
  const result = readIniOptionSettings('/missing.ini', () => { throw new Error('ENOENT'); });
  assert.equal(result, null);
});

test('resolveServerConnection uses the stored restApiUrl/restApiPassword when no settingsFilePath is set', () => {
  const server = { restApiUrl: 'http://localhost:8212', restApiPassword: 'stored-pw' };
  assert.deepEqual(resolveServerConnection(server), { restApiUrl: 'http://localhost:8212', restApiPassword: 'stored-pw' });
});

test('resolveServerConnection reads live values from the ini when settingsFilePath is set, overriding stored ones', () => {
  const server = { restApiUrl: 'http://localhost:9999', restApiPassword: 'stale-pw', settingsFilePath: '/fake.ini' };
  const readFileSync = () => 'OptionSettings=(AdminPassword="fresh-pw",RESTAPIPort=8212)';
  assert.deepEqual(resolveServerConnection(server, readFileSync), { restApiUrl: 'http://localhost:8212', restApiPassword: 'fresh-pw' });
});

test('resolveServerConnection falls back to stored values if the ini can\'t be read', () => {
  const server = { restApiUrl: 'http://localhost:8212', restApiPassword: 'stored-pw', settingsFilePath: '/missing.ini' };
  const readFileSync = () => { throw new Error('ENOENT'); };
  assert.deepEqual(resolveServerConnection(server, readFileSync), { restApiUrl: 'http://localhost:8212', restApiPassword: 'stored-pw' });
});

test('ensureGuildEntry registers a new guild across all four files with empty defaults', () => {
  const dir = tmpConfigDir();
  const guildsPath = path.join(dir, 'guilds.json');
  const rolesPath = path.join(dir, 'roles.json');
  const channelsPath = path.join(dir, 'channels.json');
  const serversPath = path.join(dir, 'servers.json');

  const added = ensureGuildEntry(guildsPath, rolesPath, channelsPath, serversPath, 'G1');

  assert.equal(added, true);
  assert.deepEqual(loadGuildsFile(guildsPath), [{ guildId: 'G1' }]);
  assert.deepEqual(loadRolesFile(rolesPath), [
    { guildId: 'G1', admin: { roleIds: [], userIds: [] }, operator: { roleIds: [], userIds: [] } },
  ]);
  assert.deepEqual(loadChannelsFile(channelsPath), [{ guildId: 'G1', botChannelId: null, serverChannelId: null }]);
  assert.deepEqual(loadServersFile(serversPath), [{ guildId: 'G1', servers: [] }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ensureGuildEntry is a no-op for an already-registered guild', () => {
  const dir = tmpConfigDir();
  const guildsPath = path.join(dir, 'guilds.json');
  const rolesPath = path.join(dir, 'roles.json');
  const channelsPath = path.join(dir, 'channels.json');
  const serversPath = path.join(dir, 'servers.json');

  ensureGuildEntry(guildsPath, rolesPath, channelsPath, serversPath, 'G1');
  const addedAgain = ensureGuildEntry(guildsPath, rolesPath, channelsPath, serversPath, 'G1');

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

test('loadConfig reads secrets from env and wires up all four config paths', () => {
  const config = loadConfig({
    DISCORD_TOKEN: 'tok',
    DISCORD_CLIENT_ID: 'cid',
    CONFIG_DIR: tmpConfigDir(),
  });

  assert.equal(config.discordToken, 'tok');
  assert.deepEqual(config.guilds, []);
  assert.deepEqual(config.roles, []);
  assert.deepEqual(config.channels, []);
  assert.deepEqual(config.servers, []);
});
