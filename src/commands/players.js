const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../embeds');
const { addServerOption } = require('../serverOption');

const data = addServerOption(new SlashCommandBuilder().setName('players').setDescription('List connected players'));
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    const { players } = await ctx.palworld.getPlayers();
    const embed = new EmbedBuilder()
      .setTitle(`Connected players (${players?.length ?? 0})`)
      .setColor(0x2ecc71)
      .setTimestamp();

    embed.setDescription(
      !players || players.length === 0
        ? 'No players are currently connected.'
        : players.map((p) => `- ${p.name} (${p.userId ?? p.accountName ?? 'unknown id'})`).join('\n'),
    );

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Server unreachable: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
