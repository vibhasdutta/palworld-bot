const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../embeds');
const { addServerOption } = require('../serverOption');

const data = addServerOption(new SlashCommandBuilder().setName('save').setDescription('Save the world'));
const tier = 'operator';

async function execute(interaction, ctx) {
  try {
    await ctx.palworld.save();
    ctx.auditLog.appendAuditEntry({ guildId: interaction.guildId, actor: interaction.user.tag, actorId: interaction.user.id, command: 'save' });
    await interaction.reply({ embeds: [successEmbed('World saved.')] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Failed to save: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
