const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createStatusChannelManager,
  buildStatusPayload,
  buildPlayersPayload,
  getServerDisplayName,
  slugForChannel,
  guildChannelNameFor,
} = require('../src/statusChannel');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'statusChannel-test-'));
}

test('slugForChannel lowercases, hyphenates, and strips characters Discord channel names reject', () => {
  assert.equal(slugForChannel('Isle of Palcadia'), 'isle-of-palcadia');
  assert.equal(slugForChannel('  Weird!! Name??  '), 'weird-name');
  assert.equal(slugForChannel(''), 'server');
});

test('guildChannelNameFor renders a plain online/total count, no emoji or brackets', () => {
  assert.equal(guildChannelNameFor(1, 2), '1-2-servers-status');
  assert.equal(guildChannelNameFor(0, 2), '0-2-servers-status');
  assert.equal(guildChannelNameFor(2, 2), '2-2-servers-status');
  assert.equal(guildChannelNameFor(0, 0), '0-0-servers-status');
});

test('getServerDisplayName prefers the ini ServerName, then falls back to the config label', () => {
  const dir = tmpDir();
  const iniPath = path.join(dir, 'PalWorldSettings.ini');
  fs.writeFileSync(iniPath, '[/Script/Pal.PalGameWorldSettings]\nOptionSettings=(ServerName="Isle of Palcadia")\n');

  assert.equal(getServerDisplayName({ label: 'main', settingsFilePath: iniPath }), 'Isle of Palcadia');
  assert.equal(getServerDisplayName({ label: 'main', settingsFilePath: null }), 'main');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('buildStatusPayload returns an online embed when the REST API is reachable', async () => {
  const palworld = {
    getInfo: async () => ({ servername: 'Isle of Palcadia', version: '1.0' }),
    getPlayers: async () => ({ players: [{ name: 'Alice' }] }),
    getMetrics: async () => ({ maxplayernum: 32, days: 5, serverfps: 60, serverframetime: 16.6, uptime: 3665 }),
  };

  const { state, embed } = await buildStatusPayload(palworld, 'online', 'Isle of Palcadia');

  assert.equal(state, 'online');
  assert.equal(embed.data.title, 'Isle of Palcadia — Online');
  assert.ok(embed.data.fields.some((f) => f.name === 'Players' && f.value === '1/32'));
});

function unreachablePalworld() {
  return {
    getInfo: async () => { throw new Error('unreachable'); },
    getPlayers: async () => { throw new Error('unreachable'); },
    getMetrics: async () => { throw new Error('unreachable'); },
  };
}

test('buildStatusPayload returns starting when REST is unreachable but pm2 reports online', async () => {
  const { state, embed } = await buildStatusPayload(unreachablePalworld(), 'online', 'main');
  assert.equal(state, 'starting');
  assert.equal(embed.data.title, 'main — Starting');
});

test('buildStatusPayload returns offline when REST is unreachable and pm2 is not online', async () => {
  const { state, embed } = await buildStatusPayload(unreachablePalworld(), 'stopped', 'main');
  assert.equal(state, 'offline');
  assert.equal(embed.data.title, 'main — Offline');
});

test('buildPlayersPayload renders a two-column name/ID table when players are connected', async () => {
  const palworld = { getPlayers: async () => ({ players: [{ name: 'Alice', playerId: 'steam_1' }, { name: 'Bob', playerId: 'steam_2' }] }) };
  const embed = await buildPlayersPayload(palworld, 'main');
  assert.equal(embed.data.title, 'main — Players (2)');
  assert.equal(embed.data.fields[0].value, 'Alice\nBob');
  assert.equal(embed.data.fields[1].value, 'steam_1\nsteam_2');
});

test('buildPlayersPayload shows a friendly empty state with zero players', async () => {
  const palworld = { getPlayers: async () => ({ players: [] }) };
  const embed = await buildPlayersPayload(palworld, 'main');
  assert.equal(embed.data.description, 'No players connected.');
});

test('buildPlayersPayload degrades gracefully when the server is unreachable', async () => {
  const embed = await buildPlayersPayload(unreachablePalworld(), 'main');
  assert.equal(embed.data.description, 'Unavailable -- server unreachable.');
});

function fakeMessage(id, initialContent) {
  return {
    id,
    content: initialContent,
    edited: [],
    edit(payload) { this.edited.push(payload); return Promise.resolve(this); },
  };
}

function fakeChannel(id, name) {
  const sentMessages = new Map();
  let nextId = 1;
  return {
    id,
    name,
    renamed: [],
    setName(newName) { this.renamed.push(newName); this.name = newName; return Promise.resolve(this); },
    messages: {
      fetch: (msgId) => sentMessages.has(msgId) ? Promise.resolve(sentMessages.get(msgId)) : Promise.reject(new Error('unknown message')),
    },
    send(payload) {
      const msg = fakeMessage(String(nextId++), payload.content);
      sentMessages.set(msg.id, msg);
      return Promise.resolve(msg);
    },
  };
}

function reachablePalworld(overrides = {}) {
  return {
    getInfo: async () => ({ servername: 'main', version: '1.0' }),
    getPlayers: async () => ({ players: [] }),
    getMetrics: async () => ({ maxplayernum: 32, days: 1, serverfps: 60, serverframetime: 16, uptime: 60 }),
    ...overrides,
  };
}

test('tick edits both messages per server in an already-configured guild channel without recreating it', async () => {
  const dir = tmpDir();
  const serversPath = path.join(dir, 'servers.json');
  const statePath = path.join(dir, 'statusChannels.json');
  fs.writeFileSync(serversPath, JSON.stringify([
    { guildId: 'G1', statusChannelId: 'C1', servers: [{ label: 'main', pm2ProcessName: 'palworld' }] },
  ]));

  const channel = fakeChannel('C1', '0-1-servers-status');
  const client = {
    guilds: { cache: { get: (guildId) => guildId === 'G1' ? { channels: { fetch: (id) => id === 'C1' ? Promise.resolve(channel) : Promise.reject(new Error('not found')) } } : undefined } },
  };

  const manager = createStatusChannelManager({
    client,
    getGuildGroups: () => [{ guildId: 'G1', statusChannelId: 'C1', servers: [{ guildId: 'G1', label: 'main', pm2ProcessName: 'palworld', restApiUrl: 'x', restApiPassword: 'x' }] }],
    createClient: () => reachablePalworld(),
    serversPath,
    statePath,
    getPm2Status: async () => 'online',
  });

  await manager.tick();

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.length, 1);
  assert.ok(state[0].statusMessageId);
  assert.ok(state[0].playersMessageId);
  assert.equal(channel.renamed.length, 1); // first tick: unset -> "1-1" triggers one rename
  assert.equal(channel.renamed[0], '1-1-servers-status');

  await manager.tick();
  assert.equal(channel.renamed.length, 1, 'no repeat rename once the count is unchanged and the name already matches');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('tick puts every server in a guild into the SAME channel with one message pair each', async () => {
  const dir = tmpDir();
  const serversPath = path.join(dir, 'servers.json');
  const statePath = path.join(dir, 'statusChannels.json');
  fs.writeFileSync(serversPath, JSON.stringify([
    { guildId: 'G1', statusChannelId: 'C1', servers: [{ label: 'main' }, { label: 'creative' }] },
  ]));

  const channel = fakeChannel('C1', '0-2-servers-status');
  const client = { guilds: { cache: { get: () => ({ channels: { fetch: (id) => id === 'C1' ? Promise.resolve(channel) : Promise.reject(new Error('nf')) } }) } } };

  const manager = createStatusChannelManager({
    client,
    getGuildGroups: () => [{
      guildId: 'G1',
      statusChannelId: 'C1',
      servers: [
        { guildId: 'G1', label: 'main', pm2ProcessName: 'palworld', restApiUrl: 'x', restApiPassword: 'x' },
        { guildId: 'G1', label: 'creative', pm2ProcessName: 'palworld2', restApiUrl: 'x', restApiPassword: 'x' },
      ],
    }],
    createClient: () => reachablePalworld(),
    serversPath,
    statePath,
    getPm2Status: async () => 'online',
  });

  await manager.tick();

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state.length, 2); // one status/players message pair per server
  assert.deepEqual(state.map((e) => e.label).sort(), ['creative', 'main']);
  assert.equal(channel.renamed[0], '2-2-servers-status'); // both servers online
  fs.rmSync(dir, { recursive: true, force: true });
});

test('tick creates a channel and persists its ID to servers.json when none is configured', async () => {
  const dir = tmpDir();
  const serversPath = path.join(dir, 'servers.json');
  const statePath = path.join(dir, 'statusChannels.json');
  fs.writeFileSync(serversPath, JSON.stringify([
    { guildId: 'G1', statusChannelId: null, servers: [{ label: 'main', pm2ProcessName: 'palworld' }] },
  ]));

  let created = null;
  const client = {
    guilds: {
      cache: {
        get: (guildId) => guildId === 'G1' ? {
          channels: {
            fetch: () => Promise.reject(new Error('not configured')),
            create: (opts) => { created = fakeChannel('NEW1', opts.name); return Promise.resolve(created); },
          },
        } : undefined,
      },
    },
  };

  const manager = createStatusChannelManager({
    client,
    getGuildGroups: () => [{ guildId: 'G1', statusChannelId: null, servers: [{ guildId: 'G1', label: 'main', pm2ProcessName: 'palworld', restApiUrl: 'x', restApiPassword: 'x' }] }],
    createClient: unreachablePalworld,
    serversPath,
    statePath,
    getPm2Status: async () => 'stopped',
  });

  await manager.tick();

  assert.ok(created, 'a channel should have been created');
  assert.equal(created.name, '0-1-servers-status');

  const servers = JSON.parse(fs.readFileSync(serversPath, 'utf8'));
  assert.equal(servers[0].statusChannelId, 'NEW1');

  fs.rmSync(dir, { recursive: true, force: true });
});
