const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotifier, findGuildChannels, formatAuditEntry } = require('../src/notify');

test('findGuildChannels returns the matching entry or null', () => {
  const channels = [{ guildId: 'G1', botChannelId: 'B1', serverChannelId: 'S1' }];
  assert.deepEqual(findGuildChannels(channels, 'G1'), channels[0]);
  assert.equal(findGuildChannels(channels, 'UNKNOWN'), null);
});

test('formatAuditEntry produces a readable line per command type', () => {
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'kick', target: 'steam_1', reason: 'AFK' }),
    '**alice** kicked `steam_1` — AFK',
  );
  assert.equal(formatAuditEntry({ actor: 'alice', command: 'save' }), '**alice** saved the world');
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'stop', force: true }),
    '**alice** stopped the server (force)',
  );
});

test('createNotifier does not touch the Discord client when no channel is configured ("if not given, no sending")', async () => {
  let fetchCalled = false;
  const fakeClient = { channels: { fetch: async () => { fetchCalled = true; } } };
  const notify = createNotifier(fakeClient, () => [{ guildId: 'G1', botChannelId: null, serverChannelId: null }]);

  await notify.botLog('G1', 'hello');
  await notify.serverLog('G1', 'hello');

  assert.equal(fetchCalled, false);
});

test('createNotifier sends to the configured channel', async () => {
  let sentTo, sentContent;
  const fakeChannel = { send: async (content) => { sentContent = content; } };
  const fakeClient = { channels: { fetch: async (id) => { sentTo = id; return fakeChannel; } } };
  const notify = createNotifier(fakeClient, () => [{ guildId: 'G1', botChannelId: 'B1', serverChannelId: 'S1' }]);

  await notify.serverLog('G1', 'server event');

  assert.equal(sentTo, 'S1');
  assert.equal(sentContent, 'server event');
});
