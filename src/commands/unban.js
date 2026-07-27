const { SlashCommandBuilder } = require('discord.js');

const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Remove a player ban')
  .addStringOption((opt) => opt.setName('userid').setDescription('Player ID (e.g. steam_xxxx)').setRequired(true));
const tier = 'operator';

async function execute(interaction, ctx) {
  const userid = interaction.options.getString('userid', true);
  try {
    await ctx.palworld.unban(userid);
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'unban', target: userid });
    await interaction.reply(`Unbanned \`${userid}\`.`);
  } catch (err) {
    await interaction.reply({ content: `Failed to unban: ${err.message}`, ephemeral: true });
  }
}

module.exports = { data, tier, execute };
