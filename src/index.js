const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events, REST, Routes, Options } = require('discord.js');
const { loadConfig, ensureGuildEntry, loadGuildsFile, loadRolesFile, loadChannelsFile } = require('./config');
const { resolveTier, hasAccess, findGuildRoles } = require('./permissions');
const { createPalworldClient } = require('./palworldClient');
const { controlService } = require('./processControl');
const { appendAuditEntry } = require('./auditLog');
const { errorEmbed } = require('./embeds');
const { createNotifier, formatAuditEntry } = require('./notify');
const loadCommands = require('./commands');

const config = loadConfig();
const commands = loadCommands();
const commandData = [...commands.values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.discordToken);

const palworld = createPalworldClient({ baseUrl: config.restApiUrl, password: config.restApiPassword });

// ponytail: this bot only handles slash commands, never reads messages/presences/
// reactions/voice state — zeroing those caches keeps memory flat instead of growing
// with server activity. GuildMemberManager is zeroed too since interaction.member
// is populated straight from the interaction payload, not from cache.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  makeCache: Options.cacheWithLimits({
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ThreadManager: 0,
    VoiceStateManager: 0,
    GuildBanManager: 0,
    GuildInviteManager: 0,
    GuildEmojiManager: 0,
    StageInstanceManager: 0,
    GuildMemberManager: 0,
  }),
});

const notify = createNotifier(client, () => config.channels);

const ctx = {
  config,
  palworld,
  processControl: {
    controlService: (action) => controlService(config.pm2ProcessName, action),
  },
  auditLog: {
    appendAuditEntry: (entry) => {
      const saved = appendAuditEntry(config.auditLogPath, entry);
      if (entry.guildId) notify.serverLog(entry.guildId, formatAuditEntry(entry)).catch(() => {});
      return saved;
    },
  },
};

async function onboardGuild(guildId, guildName) {
  const added = ensureGuildEntry(config.guildsPath, config.rolesPath, config.channelsPath, guildId);
  if (added) {
    config.guilds = loadGuildsFile(config.guildsPath);
    config.roles = loadRolesFile(config.rolesPath);
    config.channels = loadChannelsFile(config.channelsPath);
    console.log(`Joined "${guildName}" (${guildId}) — added stub entries to config/roles.json (no access granted yet) and config/channels.json (no channels set). Edit them to give people access / enable logging.`);
  }

  try {
    const data = await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commandData });
    console.log(`Registered ${data.length} commands in guild ${guildId}.`);
  } catch (err) {
    console.error(`Failed to register commands in guild ${guildId}:`, err.message);
  }
}

// ponytail: watch the directory, not each file directly — editors like nano/vim
// replace the file on save (write temp + rename), which breaks a watch held on
// the original inode. Debounced since a single save can fire multiple events.
function watchConfigFiles() {
  const dir = path.dirname(config.guildsPath); // guilds/roles/channels all live in config/
  fs.mkdirSync(dir, { recursive: true });

  const reloaders = {
    [path.basename(config.guildsPath)]: () => { config.guilds = loadGuildsFile(config.guildsPath); },
    [path.basename(config.rolesPath)]: () => { config.roles = loadRolesFile(config.rolesPath); },
    [path.basename(config.channelsPath)]: () => { config.channels = loadChannelsFile(config.channelsPath); },
  };

  const debounceTimers = {};
  fs.watch(dir, (eventType, filename) => {
    const reload = reloaders[filename];
    if (!reload) return;
    clearTimeout(debounceTimers[filename]);
    debounceTimers[filename] = setTimeout(() => {
      try {
        reload();
        console.log(`Reloaded config/${filename}.`);
      } catch (err) {
        console.error(`Failed to reload config/${filename} (keeping previous values):`, err.message);
      }
    }, 200);
  });
}

watchConfigFiles();

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  for (const guild of readyClient.guilds.cache.values()) {
    await onboardGuild(guild.id, guild.name);
  }
});

client.on(Events.GuildCreate, (guild) => {
  onboardGuild(guild.id, guild.name);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  const member = {
    roleIds: interaction.member?.roles?.cache ? [...interaction.member.roles.cache.keys()] : [],
    userId: interaction.user.id,
  };
  const guildRoles = findGuildRoles(config.roles, interaction.guildId);
  const tier = resolveTier(member, guildRoles);

  if (!hasAccess(tier, command.tier)) {
    await interaction.reply({ embeds: [errorEmbed('You do not have permission to use this command.')], ephemeral: true });
    notify.botLog(interaction.guildId, `**${interaction.user.tag}** was denied \`/${interaction.commandName}\` (no ${command.tier} access).`).catch(() => {});
    return;
  }

  try {
    await command.execute(interaction, ctx);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { embeds: [errorEmbed(`Something went wrong: ${err.message}`)], ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
    notify.botLog(interaction.guildId, `**Error** running \`/${interaction.commandName}\` for **${interaction.user.tag}**: ${err.message}`).catch(() => {});
  }
});

client.login(config.discordToken);
