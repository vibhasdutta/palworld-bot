const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder().setName('save').setDescription('Save the world');
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    await ctx.palworld.save();
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'save' });
    await interaction.reply('World saved.');
  } catch (err) {
    await interaction.reply({ content: `Failed to save: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
