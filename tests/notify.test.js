const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotifier, findGuildChannels, formatAuditEntry, formatStructuredLog } = require('../src/notify');

test('findGuildChannels returns the matching entry or null', () => {
  const channels = [{ guildId: 'G1', botChannelId: 'B1', serverChannelId: 'S1' }];
  assert.deepEqual(findGuildChannels(channels, 'G1'), channels[0]);
  assert.equal(findGuildChannels(channels, 'UNKNOWN'), null);
});

test('formatStructuredLog generates logfmt inside ```ansi codeblock with pure white timestamp and uppercase level', () => {
  const logStr = formatStructuredLog({
    timestamp: '2026-07-28T14:15:52.123Z',
    level: 'danger',
    event: 'command.kick',
    actor: 'alice (12345)',
    target: 'steam_1',
    reason: 'AFK',
  });

  assert.ok(logStr.startsWith('```ansi\n'));
  assert.ok(logStr.endsWith('\n```'));
  assert.ok(logStr.includes('2026-07-28T14:15:52.123Z'));
  assert.ok(logStr.includes('[ERROR]'));
  assert.ok(logStr.includes('event=command.kick'));
  assert.ok(logStr.includes('actor='));
  assert.ok(logStr.includes('"alice (12345)"'));
  assert.ok(logStr.includes('target='));
  assert.ok(logStr.includes('steam_1'));
  assert.ok(logStr.includes('reason='));
  assert.ok(logStr.includes('AFK'));
});

test('formatStructuredLog defaults to INFO when no level is given', () => {
  const logStr = formatStructuredLog({ description: 'x' });
  assert.ok(logStr.startsWith('```ansi\n'));
  assert.ok(logStr.includes('[INFO]'));
  assert.ok(logStr.includes('event=system.log'));
  assert.ok(logStr.includes('msg='));
  assert.ok(logStr.includes('x'));
});

test('formatAuditEntry uses a real @mention in description and formats structured actor name', () => {
  const entry = formatAuditEntry({ actor: 'alice', actorId: '12345', command: 'kick', target: 'steam_1', reason: 'AFK' });
  assert.equal(entry.description, '<@12345> (alice - ID: `12345`) kicked `steam_1` (Player ID: `steam_1`) — AFK');
  assert.equal(entry.actor, 'alice (Discord ID: 12345)');
  assert.equal(entry.event, 'discord.audit.kick');
  assert.equal(entry.level, 'danger');
});

test('formatAuditEntry falls back to plain actor name when actorId is absent', () => {
  const entry = formatAuditEntry({ actor: 'alice', command: 'save' });
  assert.equal(entry.description, '**alice** saved the world');
  assert.equal(entry.actor, 'alice');
});

test('formatAuditEntry produces a readable description and event per command type', () => {
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'kick', target: 'steam_1', reason: 'AFK' }).description,
    '**alice** kicked `steam_1` (Player ID: `steam_1`) — AFK',
  );
  assert.equal(formatAuditEntry({ actor: 'alice', command: 'save' }).description, '**alice** saved the world');
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'stop', force: true }).description,
    '**alice** stopped the server (force)',
  );
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'operator', action: 'add-role', target: 'R1', targetType: 'role' }).description,
    '**alice** granted operator to <@&R1>',
  );
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'operator', action: 'remove-user', target: 'U1', targetType: 'user' }).description,
    '**alice** revoked operator from <@U1> (ID: `U1`)',
  );
});

test('formatAuditEntry assigns a sensible severity level per command', () => {
  assert.equal(formatAuditEntry({ actor: 'a', command: 'kick', target: 't', reason: 'r' }).level, 'danger');
  assert.equal(formatAuditEntry({ actor: 'a', command: 'ban', target: 't', reason: 'r' }).level, 'danger');
  assert.equal(formatAuditEntry({ actor: 'a', command: 'stop' }).level, 'danger');
  assert.equal(formatAuditEntry({ actor: 'a', command: 'start' }).level, 'success');
  assert.equal(formatAuditEntry({ actor: 'a', command: 'restart' }).level, 'warning');
  assert.equal(formatAuditEntry({ actor: 'a', command: 'save' }).level, 'info');
});

test('createNotifier does not touch the Discord client when no channel is configured', async () => {
  let fetchCalled = false;
  const fakeClient = { channels: { fetch: async () => { fetchCalled = true; } } };
  const notify = createNotifier(fakeClient, () => [{ guildId: 'G1', botChannelId: null, serverChannelId: null }]);

  await notify.botLog('G1', { description: 'hello' });
  await notify.serverLog('G1', { description: 'hello' });

  assert.equal(fetchCalled, false);
});

test('createNotifier sends rendered clean markdown content to the configured channel', async () => {
  let sentTo, sentPayload;
  const fakeChannel = { send: async (payload) => { sentPayload = payload; } };
  const fakeClient = { channels: { fetch: async (id) => { sentTo = id; return fakeChannel; } } };
  const notify = createNotifier(fakeClient, () => [{ guildId: 'G1', botChannelId: 'B1', serverChannelId: 'S1' }]);

  await notify.serverLog('G1', { title: 'Save', description: 'server event', level: 'info' });

  assert.equal(sentTo, 'S1');
  assert.ok(sentPayload.content.startsWith('```ansi\n'));
  assert.ok(sentPayload.content.includes('[INFO]'));
  assert.ok(sentPayload.content.includes('event=save'));
  assert.ok(sentPayload.content.includes('"server event"'));
});
