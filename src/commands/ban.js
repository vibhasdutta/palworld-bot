const { SlashCommandBuilder } = require('discord.js');
const { awaitConfirmation } = require('../confirm');
const { successEmbed, errorEmbed } = require('../embeds');

const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a player from the server')
  .addStringOption((opt) => opt.setName('userid').setDescription('Player ID (e.g. steam_xxxx)').setRequired(true))
  .addStringOption((opt) => opt.setName('reason').setDescription('Reason shown to the player'));
const tier = 'operator';

async function execute(interaction, ctx) {
  const userid = interaction.options.getString('userid', true);
  const reason = interaction.options.getString('reason') || 'Banned by an admin.';

  const confirmed = await awaitConfirmation(interaction, `ban:${userid}`);
  if (!confirmed) return;

  try {
    await ctx.palworld.ban(userid, reason);
    ctx.auditLog.appendAuditEntry({ guildId: interaction.guildId, actor: interaction.user.tag, command: 'ban', target: userid, reason });
    await ctx.palworld.announce(`${userid} was banned. Reason: ${reason}`).catch(() => {});
    await interaction.followUp({ embeds: [successEmbed(`Banned \`${userid}\`.`)] });
  } catch (err) {
    await interaction.followUp({ embeds: [errorEmbed(`Failed to ban: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
