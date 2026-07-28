const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../embeds');
const { addServerOption } = require('../serverOption');

const data = addServerOption(
  new SlashCommandBuilder()
    .setName('worldsettings')
    .setDescription('Open the web-based world settings editor (admin only)'),
);
const tier = 'admin';

async function execute(interaction, ctx) {
  const server = ctx.server;
  if (!server.settingsFilePath) {
    await interaction.reply({
      ...errorEmbed('No settingsFilePath configured for this server in config/servers.json.', { command: 'worldsettings' }),
      ephemeral: true,
    });
    return;
  }

  const baseUrl = ctx.webServer?.getBaseUrl();
  if (!baseUrl) {
    await interaction.reply({
      ...errorEmbed('Web settings server is not configured. Set WEB_BASE_URL and DISCORD_CLIENT_SECRET in .env.', { command: 'worldsettings' }),
      ephemeral: true,
    });
    return;
  }

  const loginUrl = `${baseUrl}/auth/login?guild=${encodeURIComponent(interaction.guildId)}&server=${encodeURIComponent(server.label)}`;

  ctx.auditLog.appendAuditEntry({
    guildId: interaction.guildId,
    actor: interaction.user.tag,
    actorId: interaction.user.id,
    command: 'worldsettings',
  });

  await interaction.reply({
    ...successEmbed('World settings editor link generated.', {
      command: 'worldsettings',
      event: 'settings.editor_opened',
      server: server.label,
      actor: `${interaction.user.tag} (${interaction.user.id})`,
    }),
    content: `🔧 **World Settings Editor**\n\nClick the link below to open the settings editor. You'll be asked to log in with Discord to verify your identity.\n\n🔗 **[Open Settings Editor](${loginUrl})**\n\n> *Session lasts 30 minutes. Only admins can access this page.*`,
    ephemeral: true,
  });
}

module.exports = { data, tier, execute };
