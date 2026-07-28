const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatusEmbed, formatUptime } = require('../src/statusEmbed');

test('formatUptime converts seconds to "Hh Mm"', () => {
  assert.equal(formatUptime(3725), '1h 2m');
  assert.equal(formatUptime(59), '0h 0m');
});

test('buildStatusEmbed composes info/players/metrics into structured content', async () => {
  const fakePalworld = {
    getInfo: async () => ({ servername: 'Test Server', version: '1.0', description: '' }),
    getPlayers: async () => ({ players: [{ name: 'a' }, { name: 'b' }] }),
    getMetrics: async () => ({ maxplayernum: 32, days: 5, serverfps: 60, serverframetime: 16.6, uptime: 3725 }),
  };

  const payload = await buildStatusEmbed(fakePalworld);
  assert.ok(payload.content.startsWith('```ansi\n'));
  assert.ok(payload.content.includes('Test Server'));
  assert.ok(payload.content.includes('2/32'));
  assert.ok(payload.content.includes('1h 2m'));
});

test('buildStatusEmbed handles empty player list smoothly', async () => {
  const fakePalworld = {
    getInfo: async () => ({ servername: 'Test Server', version: '1.0', description: 'Welcome!' }),
    getPlayers: async () => ({ players: [] }),
    getMetrics: async () => ({ maxplayernum: 32, days: 1, serverfps: 30, serverframetime: 33.3, uptime: 0 }),
  };

  const payload = await buildStatusEmbed(fakePalworld);
  assert.ok(payload.content.startsWith('```ansi\n'));
  assert.ok(payload.content.includes('0/32'));
});
