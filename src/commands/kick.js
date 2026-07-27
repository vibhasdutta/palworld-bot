const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../embeds');
const { addServerOption } = require('../serverOption');

const data = addServerOption(new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a player from the server')
  .addStringOption((opt) => opt.setName('userid').setDescription('Player ID (e.g. steam_xxxx)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason shown to the player')));
const tier = 'operator';

async function execute(interaction, ctx) {
  const userid = interaction.options.getString('userid', true);
  const reason = interaction.options.getString('reason') || 'Kicked by an admin.';
  try {
    await ctx.palworld.kick(userid, reason);
    ctx.auditLog.appendAuditEntry({ guildId: interaction.guildId, actor: interaction.user.tag, command: 'kick', target: userid, reason });
    await ctx.palworld.announce(`${userid} was kicked. Reason: ${reason}`).catch(() => {});
    await interaction.reply({ embeds: [successEmbed(`Kicked \`${userid}\`.`)] });
  } catch (err) {
    await interaction.reply({ embeds: [errorEmbed(`Failed to kick: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
