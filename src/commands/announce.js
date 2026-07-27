const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../embeds');

const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Broadcast a message to all connected players')
  .addStringOption((opt) => opt.setName('message').setDescription('Message to broadcast').setRequired(true));
const tier = 'operator';

async function execute(interaction, ctx) {
  const message = interaction.options.getString('message', true);
  try {
    await ctx.palworld.announce(message);
    ctx.auditLog.appendAuditEntry({ guildId: interaction.guildId, actor: interaction.user.tag, command: 'announce', message });
    await interaction.reply({ embeds: [successEmbed(`Announced: "${message}"`)] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Failed to announce: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
