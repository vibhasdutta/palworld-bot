const { SlashCommandBuilder } = require('discord.js');
const { awaitConfirmation } = require('../confirm');
const { successEmbed, errorEmbed } = require('../embeds');

const data = new SlashCommandBuilder().setName('restart').setDescription('Restart the Palworld server process');
const tier = 'admin';

async function execute(interaction, ctx) {
  const confirmed = await awaitConfirmation(interaction, 'restart');
  if (!confirmed) return;

  try {
    await ctx.processControl.controlService('restart');
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'restart' });
    await interaction.followUp({ embeds: [successEmbed('Server restart triggered.')] });
  } catch (err) {
    await interaction.followUp({ embeds: [errorEmbed(`Failed to restart: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
