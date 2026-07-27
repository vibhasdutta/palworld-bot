const { EmbedBuilder } = require('discord.js');

const LEVEL_COLORS = {
  info: 0x3498db,
  success: 0x2ecc71,
  warning: 0xf39c12,
  danger: 0xe74c3c,
};

function levelForCommand(command) {
  switch (command) {
    case 'kick':
    case 'ban':
    case 'stop':
      return 'danger';
    case 'start':
      return 'success';
    case 'restart':
      return 'warning';
    default:
      return 'info';
  }
}

function titleForCommand(command) {
  switch (command) {
    case 'announce': return 'Announce';
    case 'kick': return 'Kick';
    case 'ban': return 'Ban';
    case 'unban': return 'Unban';
    case 'save': return 'Save';
    case 'start': return 'Start';
    case 'restart': return 'Restart';
    case 'stop': return 'Stop';
    case 'operator': return 'Operator Access';
    default: return 'Server Action';
  }
}

function findGuildChannels(channels, guildId) {
  return channels.find((c) => c.guildId === guildId) || null;
}

// Real @mention when we have the Discord user ID (actorId), falling back to
// the plain tag for older audit entries written before actorId existed.
function actorMention(entry) {
  return entry.actorId ? `<@${entry.actorId}>` : `**${entry.actor}**`;
}

// Returns a {title, description, level} log entry -- postToChannel renders
// this as a color-coded, timestamped embed instead of a plain-text message.
function formatAuditEntry(entry) {
  const actor = actorMention(entry);
  const base = { title: titleForCommand(entry.command), level: levelForCommand(entry.command) };
  switch (entry.command) {
    case 'announce':
      return { ...base, description: `${actor} announced: "${entry.message}"` };
    case 'kick':
      return { ...base, description: `${actor} kicked \`${entry.target}\` — ${entry.reason}` };
    case 'ban':
      return { ...base, description: `${actor} banned \`${entry.target}\` — ${entry.reason}` };
    case 'unban':
      return { ...base, description: `${actor} unbanned \`${entry.target}\`` };
    case 'save':
      return { ...base, description: `${actor} saved the world` };
    case 'start':
      return { ...base, description: `${actor} started the server` };
    case 'restart':
      return { ...base, description: `${actor} restarted the server` };
    case 'stop':
      return { ...base, description: `${actor} stopped the server${entry.force ? ' (force)' : ''}` };
    case 'operator': {
      const verb = entry.action.startsWith('add') ? 'granted operator to' : 'revoked operator from';
      const mention = entry.targetType === 'role' ? `<@&${entry.target}>` : `<@${entry.target}>`;
      return { ...base, description: `${actor} ${verb} ${mention}` };
    }
    default:
      return { ...base, description: `${actor} ran ${entry.command}` };
  }
}

function buildLogEmbed({ title, description, level = 'info' }) {
  const embed = new EmbedBuilder().setColor(LEVEL_COLORS[level] ?? LEVEL_COLORS.info).setDescription(description).setTimestamp();
  if (title) embed.setTitle(title);
  return embed;
}

async function postToChannel(client, channelId, entry) {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ embeds: [buildLogEmbed(entry)] });
  } catch (err) {
    console.error(`Failed to post to channel ${channelId}:`, err.message);
  }
}

// getChannels is a function, not a static array, so this always sees the
// latest hot-reloaded config.channels rather than a stale snapshot from
// whenever createNotifier() was called. `entry` is {title?, description, level?}.
function createNotifier(client, getChannels) {
  return {
    botLog(guildId, entry) {
      const channels = findGuildChannels(getChannels(), guildId);
      return postToChannel(client, channels?.botChannelId, entry);
    },
    serverLog(guildId, entry) {
      const channels = findGuildChannels(getChannels(), guildId);
      return postToChannel(client, channels?.serverChannelId, entry);
    },
  };
}

module.exports = { createNotifier, findGuildChannels, formatAuditEntry, buildLogEmbed };
