const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../embeds');
const { addServerOption } = require('../serverOption');

const data = addServerOption(new SlashCommandBuilder().setName('start').setDescription('Start the Palworld server process'));
const tier = 'admin';

async function execute(interaction, ctx) {
  try {
    await ctx.processControl.controlService('start');
    ctx.auditLog.appendAuditEntry({ guildId: interaction.guildId, actor: interaction.user.tag, command: 'start' });
    await interaction.reply({ embeds: [successEmbed('Server start triggered.')] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Failed to start: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
