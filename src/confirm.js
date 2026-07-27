const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildConfirmRow(actionId) {
  const confirmId = `confirm:${actionId}`;
  const cancelId = `cancel:${actionId}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  return { row, confirmId, cancelId };
}

async function awaitConfirmation(interaction, actionId, timeoutMs = 15000) {
  const { row, confirmId, cancelId } = buildConfirmRow(actionId);
  const reply = await interaction.reply({
    content: 'Are you sure? This action cannot be undone.',
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  try {
    const buttonInteraction = await reply.awaitMessageComponent({
      filter: (i) => i.user.id === interaction.user.id && [confirmId, cancelId].includes(i.customId),
      time: timeoutMs,
    });
    const confirmed = buttonInteraction.customId === confirmId;
    await buttonInteraction.update({ content: confirmed ? 'Confirmed.' : 'Cancelled.', components: [] });
    return confirmed;
  } catch {
    await interaction.editReply({ content: 'Confirmation timed out.', components: [] });
    return false;
  }
}

module.exports = { buildConfirmRow, awaitConfirmation };
