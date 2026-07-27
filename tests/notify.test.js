const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotifier, findGuildChannels, formatAuditEntry, buildLogEmbed } = require('../src/notify');

test('findGuildChannels returns the matching entry or null', () => {
  const channels = [{ guildId: 'G1', botChannelId: 'B1', serverChannelId: 'S1' }];
  assert.deepEqual(findGuildChannels(channels, 'G1'), channels[0]);
  assert.equal(findGuildChannels(channels, 'UNKNOWN'), null);
});

test('buildLogEmbed sets color from level, description, timestamp, and an optional title', () => {
  const embed = buildLogEmbed({ title: 'Kick', description: 'someone got kicked', level: 'danger' });
  const json = embed.toJSON();

  assert.equal(json.title, 'Kick');
  assert.equal(json.description, 'someone got kicked');
  assert.equal(json.color, 0xe74c3c);
  assert.ok(json.timestamp);
});

test('buildLogEmbed defaults to the info color when no level is given', () => {
  const embed = buildLogEmbed({ description: 'x' });
  assert.equal(embed.toJSON().color, 0x3498db);
});

test('formatAuditEntry uses a real @mention when actorId is present', () => {
  const entry = formatAuditEntry({ actor: 'alice', actorId: '12345', command: 'kick', target: 'steam_1', reason: 'AFK' });
  assert.equal(entry.description, '<@12345> kicked `steam_1` — AFK');
  assert.equal(entry.title, 'Kick');
  assert.equal(entry.level, 'danger');
});

test('formatAuditEntry falls back to the plain tag for older entries with no actorId', () => {
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'save' }).description,
    '**alice** saved the world',
  );
});

test('formatAuditEntry produces a readable description per command type', () => {
  assert.equal(
    formatAuditEntry({ actor: 'alice', command: 'kick', target: 'steam_1', reason: 'AFK' }).description,
    '**alice** kicked `steam_1` — AFK',
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
    '**alice** revoked operator from <@U1>',
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

test('createNotifier does not touch the Discord client when no channel is configured ("if not given, no sending")', async () => {
  let fetchCalled = false;
  const fakeClient = { channels: { fetch: async () => { fetchCalled = true; } } };
  const notify = createNotifier(fakeClient, () => [{ guildId: 'G1', botChannelId: null, serverChannelId: null }]);

  await notify.botLog('G1', { description: 'hello' });
  await notify.serverLog('G1', { description: 'hello' });

  assert.equal(fetchCalled, false);
});

test('createNotifier sends a rendered embed to the configured channel', async () => {
  let sentTo, sentPayload;
  const fakeChannel = { send: async (payload) => { sentPayload = payload; } };
  const fakeClient = { channels: { fetch: async (id) => { sentTo = id; return fakeChannel; } } };
  const notify = createNotifier(fakeClient, () => [{ guildId: 'G1', botChannelId: 'B1', serverChannelId: 'S1' }]);

  await notify.serverLog('G1', { title: 'Save', description: 'server event', level: 'info' });

  assert.equal(sentTo, 'S1');
  assert.equal(sentPayload.embeds.length, 1);
  assert.equal(sentPayload.embeds[0].toJSON().description, 'server event');
});
