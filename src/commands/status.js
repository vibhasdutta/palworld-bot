const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { errorEmbed } = require('../embeds');

const data = new SlashCommandBuilder().setName('status').setDescription('Show Palworld server status');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    const [info, { players }] = await Promise.all([
      ctx.palworld.getInfo(),
      ctx.palworld.getPlayers(),
    ]);

    const embed = new EmbedBuilder()
      .setTitle(info.servername)
      .setColor(0x2ecc71)
      .addFields(
        { name: 'Version', value: info.version, inline: true },
        { name: 'Players online', value: String(players.length), inline: true },
      )
      .setTimestamp();

    if (info.description) embed.setDescription(info.description);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Server unreachable: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
