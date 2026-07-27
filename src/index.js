const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events, REST, Routes, Options } = require('discord.js');
const { loadConfig, ensureGuildEntry, loadGuildsFile } = require('./config');
const { resolveTier, hasAccess, findGuildRoles } = require('./permissions');
const { createPalworldClient } = require('./palworldClient');
const { controlService } = require('./processControl');
const { appendAuditEntry } = require('./auditLog');
const { errorEmbed } = require('./embeds');
const loadCommands = require('./commands');

const config = loadConfig();
const commands = loadCommands();
const commandData = [...commands.values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.discordToken);

const palworld = createPalworldClient({ baseUrl: config.restApiUrl, password: config.restApiPassword });

const ctx = {
  config,
  palworld,
  processControl: {
    controlService: (action) => controlService(config.pm2ProcessName, action),
  },
  auditLog: {
    appendAuditEntry: (entry) => appendAuditEntry(config.auditLogPath, entry),
  },
};

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

async function onboardGuild(guildId, guildName) {
  const added = ensureGuildEntry(config.guildsPath, guildId);
  if (added) {
    config.guilds = loadGuildsFile(config.guildsPath);
    console.log(`Joined "${guildName}" (${guildId}) — added a stub entry to config/guilds.json with no roles granted yet. Edit it to give people access.`);
  }

  try {
    const data = await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commandData });
    console.log(`Registered ${data.length} commands in guild ${guildId}.`);
  } catch (err) {
    console.error(`Failed to register commands in guild ${guildId}:`, err.message);
  }
}

// ponytail: watch the directory, not the file directly — editors like nano/vim
// replace the file on save (write temp + rename), which breaks a watch held on
// the original inode. Debounced since a single save can fire multiple events.
function watchGuildsFile() {
  const dir = path.dirname(config.guildsPath);
  const target = path.basename(config.guildsPath);
  fs.mkdirSync(dir, { recursive: true });

  let debounceTimer = null;
  fs.watch(dir, (eventType, filename) => {
    if (filename !== target) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        config.guilds = loadGuildsFile(config.guildsPath);
        console.log('Reloaded config/guilds.json.');
      } catch (err) {
        console.error('Failed to reload config/guilds.json (keeping previous values):', err.message);
      }
    }, 200);
  });
}

watchGuildsFile();

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
  const guildRoles = findGuildRoles(config.guilds, interaction.guildId);
  const tier = resolveTier(member, guildRoles);

  if (!hasAccess(tier, command.tier)) {
    await interaction.reply({ embeds: [errorEmbed('You do not have permission to use this command.')], ephemeral: true });
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
  }
});

client.login(config.discordToken);
