// Live status dashboard: one auto-updating channel per configured server,
// containing exactly two messages (server status, connected players) that
// get edited in place on a fixed interval, plus a channel name that reflects
// online/starting/offline. If no channel is configured yet, or a configured
// channel/message has been deleted, one is (re)created automatically and the
// new ID is written back to servers.json -- the human only ever has to *edit*
// config/servers.json afterward to point at a different existing channel.
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, ChannelType } = require('discord.js');
const pm2 = require('pm2');
const { mutateGuildServer } = require('./config');
const { readWorldSettings } = require('./worldSettingsParser');
const { cleanPlayerId } = require('./playerPoller');

const COLORS = { online: 0x16a34a, starting: 0xd97706, offline: 0xdc2626 };
const EMOJI = { online: '🟢', starting: '🟡', offline: '🔴' };

function slugForChannel(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'server';
}

function channelNameFor(state, displayName) {
  return `${EMOJI[state]}-status-${slugForChannel(displayName)}-status`;
}

// REST /v1/api/info is the freshest source for the live server name, but
// it's only reachable while the process is actually up -- fall back to the
// ini's own ServerName (always on disk, running or not), then the config
// label as a last resort.
function getServerDisplayName(server, liveServerName) {
  if (liveServerName) return liveServerName;
  if (server.settingsFilePath) {
    try {
      const { settings } = readWorldSettings(server.settingsFilePath);
      const name = settings.get('ServerName');
      if (name) return name.replace(/^"|"$/g, '');
    } catch {
      // fall through to label
    }
  }
  return server.label;
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function defaultGetPm2Status(pm2ProcessName) {
  return new Promise((resolve) => {
    pm2.describe(pm2ProcessName, (err, list) => {
      resolve(err || !list?.[0] ? 'unknown' : list[0].pm2_env.status);
    });
  });
}

// Builds both the status embed and resolves this poll's state
// ('online'/'starting'/'offline') in one shot, since the embed depends on
// which branch it took. REST reachable -> online. REST unreachable but pm2
// says the process is up -> starting (booting, not crashed). Anything else
// -> offline.
async function buildStatusPayload(palworld, pm2Status) {
  try {
    const [info, { players = [] }, metrics] = await Promise.all([
      palworld.getInfo(),
      palworld.getPlayers(),
      palworld.getMetrics(),
    ]);
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI.online} Server Online`)
      .setColor(COLORS.online)
      .addFields(
        { name: 'Server', value: info.servername || 'Palworld', inline: true },
        { name: 'Version', value: info.version || 'unknown', inline: true },
        { name: 'Players', value: `${players.length}/${metrics.maxplayernum}`, inline: true },
        { name: 'Day', value: `${metrics.days}`, inline: true },
        { name: 'FPS', value: `${metrics.serverfps} (${metrics.serverframetime.toFixed(1)}ms)`, inline: true },
        { name: 'Uptime', value: formatUptime(metrics.uptime), inline: true },
      )
      .setTimestamp();
    return { state: 'online', serverName: info.servername || null, embed };
  } catch {
    const state = pm2Status === 'online' ? 'starting' : 'offline';
    const embed = new EmbedBuilder()
      .setTitle(state === 'starting' ? `${EMOJI.starting} Server Starting` : `${EMOJI.offline} Server Offline`)
      .setColor(COLORS[state])
      .setDescription(state === 'starting' ? 'Process is up, waiting for the game to finish booting...' : 'The server process is not running.')
      .setTimestamp();
    return { state, serverName: null, embed };
  }
}

async function buildPlayersPayload(palworld) {
  try {
    const { players = [] } = await palworld.getPlayers();
    const embed = new EmbedBuilder().setTitle(`👥 Connected Players (${players.length})`).setColor(0x6366f1).setTimestamp();
    if (players.length === 0) {
      embed.setDescription('No players connected.');
    } else {
      embed.addFields(
        { name: 'Name', value: players.map((p) => p.name || 'Connecting').join('\n').slice(0, 1024), inline: true },
        { name: 'Player ID', value: players.map((p) => cleanPlayerId(p.playerId) || p.userId || 'unknown').join('\n').slice(0, 1024), inline: true },
      );
    }
    return embed;
  } catch {
    return new EmbedBuilder().setTitle('👥 Connected Players').setColor(0x6b7280).setDescription('Unavailable -- server unreachable.').setTimestamp();
  }
}

function readState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return [];
  }
}

function writeState(statePath, state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function createStatusChannelManager({
  client,
  getServers,
  createClient,
  serversPath,
  statePath,
  getPm2Status = defaultGetPm2Status,
  intervalMs = 10000,
}) {
  const lastState = new Map(); // `${guildId}:${label}` -> 'online' | 'starting' | 'offline'

  function getEntry(guildId, label) {
    return readState(statePath).find((e) => e.guildId === guildId && e.label === label) || null;
  }

  function saveEntry(guildId, label, patch) {
    const state = readState(statePath);
    let entry = state.find((e) => e.guildId === guildId && e.label === label);
    if (!entry) {
      entry = { guildId, label };
      state.push(entry);
    }
    Object.assign(entry, patch);
    writeState(statePath, state);
  }

  // Configured channel missing, deleted, or never set -- (re)create one and
  // persist the new ID so config/servers.json stays the source of truth the
  // human can hand-edit afterward.
  async function resolveChannel(server, initialName) {
    const guild = client.guilds.cache.get(server.guildId);
    if (!guild) return null;

    if (server.statusChannelId) {
      const existing = await guild.channels.fetch(server.statusChannelId).catch(() => null);
      if (existing) return existing;
    }

    const created = await guild.channels.create({
      name: initialName,
      type: ChannelType.GuildText,
      reason: 'Palworld live status channel',
    }).catch((err) => {
      console.error(`statusChannel: failed to create status channel in guild ${server.guildId}:`, err.message);
      return null;
    });
    if (!created) return null;

    mutateGuildServer(serversPath, server.guildId, server.label, (s) => { s.statusChannelId = created.id; });
    return created;
  }

  // Configured message missing, deleted, or never sent -- send a fresh one
  // and persist its ID the same way.
  async function resolveMessage(channel, guildId, label, idField) {
    const existingId = getEntry(guildId, label)?.[idField];
    if (existingId) {
      const msg = await channel.messages.fetch(existingId).catch(() => null);
      if (msg) return msg;
    }
    const msg = await channel.send({ content: 'Initializing...' }).catch((err) => {
      console.error(`statusChannel: failed to send message in channel ${channel.id}:`, err.message);
      return null;
    });
    if (msg) saveEntry(guildId, label, { [idField]: msg.id });
    return msg;
  }

  async function tick() {
    for (const server of getServers()) {
      const key = `${server.guildId}:${server.label}`;
      try {
        const palworld = createClient({ baseUrl: server.restApiUrl, password: server.restApiPassword });
        const pm2Status = await getPm2Status(server.pm2ProcessName);
        const { state, serverName, embed: statusEmbed } = await buildStatusPayload(palworld, pm2Status);
        const displayName = getServerDisplayName(server, serverName);

        const channel = await resolveChannel(server, channelNameFor(state, displayName));
        if (!channel) continue;

        const playersEmbed = await buildPlayersPayload(palworld);

        const statusMsg = await resolveMessage(channel, server.guildId, server.label, 'statusMessageId');
        if (statusMsg) await statusMsg.edit({ content: '', embeds: [statusEmbed] }).catch(() => {});

        const playersMsg = await resolveMessage(channel, server.guildId, server.label, 'playersMessageId');
        if (playersMsg) await playersMsg.edit({ content: '', embeds: [playersEmbed] }).catch(() => {});

        const desiredName = channelNameFor(state, displayName);
        if (lastState.get(key) !== state && channel.name !== desiredName) {
          await channel.setName(desiredName).catch((err) => console.error(`statusChannel: failed to rename channel for ${key}:`, err.message));
        }
        lastState.set(key, state);
      } catch (err) {
        console.error(`statusChannel: tick failed for ${key}:`, err.message);
      }
    }
  }

  function start() {
    tick().catch((err) => console.error('statusChannel: initial tick failed:', err.message));
    return setInterval(() => tick().catch((err) => console.error('statusChannel: tick failed:', err.message)), intervalMs);
  }

  return { start, tick };
}

module.exports = { createStatusChannelManager, buildStatusPayload, buildPlayersPayload, getServerDisplayName, slugForChannel, channelNameFor };
