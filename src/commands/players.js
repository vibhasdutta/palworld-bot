const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('players').setDescription('List connected players');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    const { players } = await ctx.palworld.getPlayers();
    if (!players || players.length === 0) {
      await interaction.reply('No players are currently connected.');
      return;
    }
    const lines = players.map((p) => `- ${p.name} (${p.userId ?? p.accountName ?? 'unknown id'})`);
    await interaction.reply(`**Connected players (${players.length}):**\n${lines.join('\n')}`);
  } catch (err) {
    await interaction.reply({ content: `Server unreachable: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
