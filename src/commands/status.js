const { SlashCommandBuilder } = require('discord.js');
const { errorEmbed } = require('../embeds');
const { buildStatusEmbed } = require('../statusEmbed');

const data = new SlashCommandBuilder().setName('status').setDescription('Show Palworld server status');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    const embed = await buildStatusEmbed(ctx.palworld);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Server unreachable: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
