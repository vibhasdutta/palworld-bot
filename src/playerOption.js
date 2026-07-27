const { findGuildServer } = require('./config');
const { createPalworldClient } = require('./palworldClient');

// Shared by /kick and /ban -- both target a currently-connected player, so
// autocompleting against that server's live player list beats making
// someone copy-paste a raw player ID. /unban isn't a candidate for this:
// Palworld's REST API has no endpoint to list banned players, only
// connected ones, so there's nothing to autocomplete against there.
function addUserIdOption(builder) {
  return builder.addStringOption((opt) => opt
    .setName('userid')
    .setDescription('Player (start typing a name to search connected players)')
    .setRequired(true)
    .setAutocomplete(true));
}

async function autocompletePlayers(interaction, config, createClient = createPalworldClient) {
  const label = interaction.options.getString('server');
  const server = findGuildServer(config.servers, interaction.guildId, label);
  if (!server) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  try {
    const client = createClient({ baseUrl: server.restApiUrl, password: server.restApiPassword });
    const { players = [] } = await client.getPlayers();
    const choices = players
      .filter((p) => p.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((p) => ({ name: p.name, value: p.userId || p.accountName || p.name }));
    await interaction.respond(choices);
  } catch {
    // server unreachable mid-typing -- just show no choices, don't error the autocomplete
    await interaction.respond([]);
  }
}

module.exports = { addUserIdOption, autocompletePlayers };
