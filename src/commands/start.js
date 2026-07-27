const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('start').setDescription('Start the Palworld server process');
const tier = 'admin';

async function execute(interaction, ctx) {
  try {
    await ctx.processControl.controlService('start');
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'start' });
    await interaction.reply('Server start triggered.');
  } catch (err) {
    await interaction.reply({ content: `Failed to start: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
