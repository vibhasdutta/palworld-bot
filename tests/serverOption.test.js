const test = require('node:test');
const assert = require('node:assert/strict');
const { SlashCommandBuilder } = require('discord.js');
const { addServerOption, autocompleteServer } = require('../src/serverOption');

test('addServerOption adds an autocompleted "server" string option', () => {
  const data = addServerOption(new SlashCommandBuilder().setName('status').setDescription('x'));
  const json = data.toJSON();

  const serverOption = json.options.find((o) => o.name === 'server');
  assert.ok(serverOption, 'expected a "server" option');
  assert.equal(serverOption.autocomplete, true);
  assert.equal(serverOption.required, false);
});

test('autocompleteServer responds with only that guild\'s server labels matching the typed prefix', async () => {
  const config = {
    servers: [
      {
        guildId: 'G1',
        servers: [
          { label: 'main', restApiUrl: 'http://localhost:8212', restApiPassword: 'a', pm2ProcessName: 'palworld' },
          { label: 'pvp', restApiUrl: 'http://localhost:8222', restApiPassword: 'b', pm2ProcessName: 'palworld2' },
        ],
      },
      {
        guildId: 'G2',
        servers: [{ label: 'other-guild-server', restApiUrl: 'x', restApiPassword: 'x', pm2ProcessName: 'x' }],
      },
    ],
  };

  let responded;
  const interaction = {
    guildId: 'G1',
    options: { getFocused: () => 'p' },
    respond: async (choices) => { responded = choices; },
  };

  await autocompleteServer(interaction, config);

  assert.deepEqual(responded, [{ name: 'pvp', value: 'pvp' }]);
});

test('autocompleteServer excludes incomplete server entries', async () => {
  const config = {
    servers: [
      {
        guildId: 'G1',
        servers: [{ label: 'incomplete', restApiUrl: '', restApiPassword: '', pm2ProcessName: '' }],
      },
    ],
  };

  let responded;
  const interaction = {
    guildId: 'G1',
    options: { getFocused: () => '' },
    respond: async (choices) => { responded = choices; },
  };

  await autocompleteServer(interaction, config);

  assert.deepEqual(responded, []);
});
