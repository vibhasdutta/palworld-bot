const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlayerPoller, playerKey } = require('../src/playerPoller');

function fakeNotify() {
  const messages = [];
  return {
    messages,
    serverLog: async (guildId, content) => { messages.push({ guildId, content }); },
  };
}

function clientReturning(players) {
  return () => ({ getPlayers: async () => ({ players }) });
}

test('playerKey prefers playerId, then userId, then accountName, then name', () => {
  assert.equal(playerKey({ playerId: 'p1', userId: 'u1', accountName: 'a1', name: 'n1' }), 'p1');
  assert.equal(playerKey({ userId: 'u1', accountName: 'a1', name: 'n1' }), 'u1');
  assert.equal(playerKey({ accountName: 'a1', name: 'n1' }), 'a1');
  assert.equal(playerKey({ name: 'n1' }), 'n1');
});

test('the first poll seeds state silently -- no join messages for players already online', async () => {
  const notify = fakeNotify();
  const poller = createPlayerPoller({
    getServers: () => [{ guildId: 'G1', label: 'main', restApiUrl: 'x', restApiPassword: 'x' }],
    createClient: clientReturning([{ userId: 'u1', name: 'Alice' }]),
    notify,
  });

  await poller.pollOnce();

  assert.deepEqual(notify.messages, []);
});

test('a new player on the second poll is reported as joined', async () => {
  const notify = fakeNotify();
  let players = [{ userId: 'u1', name: 'Alice' }];
  const poller = createPlayerPoller({
    getServers: () => [{ guildId: 'G1', label: 'main', restApiUrl: 'x', restApiPassword: 'x' }],
    createClient: () => ({ getPlayers: async () => ({ players }) }),
    notify,
  });

  await poller.pollOnce(); // seed
  players = [{ userId: 'u1', name: 'Alice' }, { userId: 'u2', name: 'Bob' }];
  await poller.pollOnce();

  assert.deepEqual(notify.messages, [
    {
      guildId: 'G1',
      content: {
        event: 'player.join',
        server: 'main',
        player: 'Bob',
        playerId: 'u2',
        status: 'joined',
        level: 'join',
        msg: '**Bob** (Player ID: `u2`) joined main',
      },
    },
  ]);
});

test('a player missing on the second poll is reported as left', async () => {
  const notify = fakeNotify();
  let players = [{ userId: 'u1', name: 'Alice' }, { userId: 'u2', name: 'Bob' }];
  const poller = createPlayerPoller({
    getServers: () => [{ guildId: 'G1', label: 'main', restApiUrl: 'x', restApiPassword: 'x' }],
    createClient: () => ({ getPlayers: async () => ({ players }) }),
    notify,
  });

  await poller.pollOnce(); // seed
  players = [{ userId: 'u1', name: 'Alice' }];
  await poller.pollOnce();

  assert.deepEqual(notify.messages, [
    {
      guildId: 'G1',
      content: {
        event: 'player.leave',
        server: 'main',
        player: 'Bob',
        playerId: 'u2',
        status: 'left',
        level: 'leave',
        msg: '**Bob** (Player ID: `u2`) left main',
      },
    },
  ]);
});

test('a REST failure is skipped without wiping known state (no false mass-leave)', async () => {
  const notify = fakeNotify();
  let shouldFail = false;
  const poller = createPlayerPoller({
    getServers: () => [{ guildId: 'G1', label: 'main', restApiUrl: 'x', restApiPassword: 'x' }],
    createClient: () => ({
      getPlayers: async () => {
        if (shouldFail) throw new Error('unreachable');
        return { players: [{ userId: 'u1', name: 'Alice' }] };
      },
    }),
    notify,
  });

  await poller.pollOnce(); // seed with Alice online
  shouldFail = true;
  await poller.pollOnce(); // outage -- should not report Alice leaving
  shouldFail = false;
  await poller.pollOnce(); // recovers -- Alice still known, no false rejoin

  assert.deepEqual(notify.messages, []);
});

test('a server removed from config stops being tracked (no leak, no stale leave message)', async () => {
  const notify = fakeNotify();
  let servers = [{ guildId: 'G1', label: 'main', restApiUrl: 'x', restApiPassword: 'x' }];
  const poller = createPlayerPoller({
    getServers: () => servers,
    createClient: clientReturning([{ userId: 'u1', name: 'Alice' }]),
    notify,
  });

  await poller.pollOnce();
  servers = [];
  await poller.pollOnce();

  assert.deepEqual(notify.messages, []);
});
