const { SlashCommandBuilder } = require('discord.js');
const { awaitConfirmation } = require('../confirm');
const { PalworldApiError } = require('../palworldClient');
const { successEmbed, errorEmbed } = require('../embeds');

const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop the Palworld server')
  .addIntegerOption((opt) => opt.setName('waittime').setDescription('Seconds to warn players before shutdown').setMinValue(0))
  .addBooleanOption((opt) => opt.setName('force').setDescription('Force stop immediately, skipping the in-game warning'));
const tier = 'admin';

async function execute(interaction, ctx) {
  const waittime = interaction.options.getInteger('waittime') ?? 30;
  const force = interaction.options.getBoolean('force') ?? false;

  const confirmed = await awaitConfirmation(interaction, 'stop');
  if (!confirmed) return;

  try {
    if (force) {
      await ctx.palworld.stop();
    } else {
      await ctx.palworld.shutdown(waittime, `Server is shutting down in ${waittime} seconds.`);
    }
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'stop', force, waittime });
    await interaction.followUp({ embeds: [successEmbed('Server stop triggered.')] });
    return;
  } catch (err) {
    if (!(err instanceof PalworldApiError)) {
      await interaction.followUp({ embeds: [errorEmbed(`Failed to stop: ${err.message}`)], ephemeral: true });
      return;
    }
  }

  try {
    await ctx.processControl.controlService('stop');
    ctx.auditLog.appendAuditEntry({ actor: interaction.user.tag, command: 'stop', via: 'pm2-fallback' });
    await interaction.followUp({ embeds: [successEmbed('Server was unreachable via REST API — stopped via pm2 instead.')] });
  } catch (err) {
    await interaction.followUp({ embeds: [errorEmbed(`Failed to stop: ${err.message}`)], ephemeral: true });
  }
}

module.exports = { data, tier, execute };
