const { Client, GatewayIntentBits, Events } = require('discord.js');
const { loadConfig } = require('./config');
const { resolveTier, hasAccess, findGuildRoles } = require('./permissions');
const { createPalworldClient } = require('./palworldClient');
const { controlService } = require('./processControl');
const { appendAuditEntry } = require('./auditLog');
const loadCommands = require('./commands');

const config = loadConfig();
const commands = loadCommands();

const palworld = createPalworldClient({ baseUrl: config.restApiUrl, password: config.restApiPassword });

const ctx = {
  config,
  palworld,
  processControl: {
    controlService: (action) => controlService(config.systemdUnit, action),
  },
  auditLog: {
    appendAuditEntry: (entry) => appendAuditEntry(config.auditLogPath, entry),
  },
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  const member = {
    roleIds: interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : [],
    userId: interaction.user.id,
  };
  const guildRoles = findGuildRoles(config.guilds, interaction.guildId);
  const tier = resolveTier(member, guildRoles);

  if (!hasAccess(tier, command.tier)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction, ctx);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: `Something went wrong: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
});

client.login(config.discordToken);
