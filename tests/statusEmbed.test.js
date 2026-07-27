const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStatusEmbed, formatUptime } = require('../src/statusEmbed');

test('formatUptime converts seconds to "Hh Mm"', () => {
  assert.equal(formatUptime(3725), '1h 2m');
  assert.equal(formatUptime(59), '0h 0m');
});

test('buildStatusEmbed composes info/players/metrics into an embed', async () => {
  const fakePalworld = {
    getInfo: async () => ({ servername: 'Test Server', version: '1.0', description: '' }),
    getPlayers: async () => ({ players: [{ name: 'a' }, { name: 'b' }] }),
    getMetrics: async () => ({ maxplayernum: 32, days: 5, serverfps: 60, serverframetime: 16.6, uptime: 3725 }),
  };

  const embed = await buildStatusEmbed(fakePalworld);
  const json = embed.toJSON();

  assert.equal(json.title, 'Test Server');
  assert.deepEqual(json.fields.find((f) => f.name === 'Players'), { name: 'Players', value: '2/32', inline: true });
  assert.deepEqual(json.fields.find((f) => f.name === 'In-game day'), { name: 'In-game day', value: '5', inline: true });
  assert.deepEqual(json.fields.find((f) => f.name === 'Server uptime'), { name: 'Server uptime', value: '1h 2m', inline: true });
});

test('buildStatusEmbed sets a description when the server has one', async () => {
  const fakePalworld = {
    getInfo: async () => ({ servername: 'Test Server', version: '1.0', description: 'Welcome!' }),
    getPlayers: async () => ({ players: [] }),
    getMetrics: async () => ({ maxplayernum: 32, days: 1, serverfps: 30, serverframetime: 33.3, uptime: 0 }),
  };

  const embed = await buildStatusEmbed(fakePalworld);
  assert.equal(embed.toJSON().description, 'Welcome!');
});
