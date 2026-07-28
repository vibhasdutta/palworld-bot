const test = require('node:test');
const assert = require('node:assert/strict');
const { SlashCommandBuilder } = require('discord.js');
const { addUserIdOption, autocompletePlayers } = require('../src/playerOption');

test('addUserIdOption adds an autocompleted "userid" string option, not required at the schema level', () => {
  // Not required in the schema (see the comment in playerOption.js) so it
  // can be declared after the optional `server` option -- Discord requires
  // required options to come first. Commands validate it's present themselves.
  const data = addUserIdOption(new SlashCommandBuilder().setName('kick').setDescription('x'));
  const json = data.toJSON();

  const useridOption = json.options.find((o) => o.name === 'userid');
  assert.ok(useridOption, 'expected a "userid" option');
  assert.equal(useridOption.autocomplete, true);
  assert.equal(useridOption.required, false);
});

const completeServer = { guildId: 'G1', servers: [{ label: 'main', restApiUrl: 'x', restApiPassword: 'x', pm2ProcessName: 'palworld' }] };

test('autocompletePlayers responds with [] when no server can be resolved for this guild', async () => {
  const config = { servers: [] };
  let responded;
  const interaction = {
    guildId: 'G1',
    options: { getString: () => null, getFocused: () => '' },
    respond: async (choices) => { responded = choices; },
  };

  await autocompletePlayers(interaction, config);

  assert.deepEqual(responded, []);
});

test('autocompletePlayers filters the resolved server\'s live players by the typed prefix', async () => {
  const config = { servers: [completeServer] };
  const fakeClient = () => ({
    getPlayers: async () => ({
      players: [
        { userId: 'u1', name: 'Alice' },
        { userId: 'u2', name: 'Bob' },
        { userId: 'u3', name: 'Alison' },
      ],
    }),
  });
  let responded;
  const interaction = {
    guildId: 'G1',
    options: { getString: () => null, getFocused: () => 'ali' },
    respond: async (choices) => { responded = choices; },
  };

  await autocompletePlayers(interaction, config, fakeClient);

  assert.deepEqual(responded, [
    { name: 'Alice (u1)', value: 'u1' },
    { name: 'Alison (u3)', value: 'u3' },
  ]);
});

test('autocompletePlayers responds with [] instead of throwing when the server is unreachable', async () => {
  const config = { servers: [completeServer] };
  const fakeClient = () => ({ getPlayers: async () => { throw new Error('unreachable'); } });
  let responded;
  const interaction = {
    guildId: 'G1',
    options: { getString: () => null, getFocused: () => '' },
    respond: async (choices) => { responded = choices; },
  };

  await autocompletePlayers(interaction, config, fakeClient);

  assert.deepEqual(responded, []);
});
