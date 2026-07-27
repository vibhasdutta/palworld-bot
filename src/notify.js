function findGuildChannels(channels, guildId) {
  return channels.find((c) => c.guildId === guildId) || null;
}

// Real @mention when we have the Discord user ID (actorId), falling back to
// the plain tag for older audit entries written before actorId existed.
function actorMention(entry) {
  return entry.actorId ? `<@${entry.actorId}>` : `**${entry.actor}**`;
}

function formatAuditEntry(entry) {
  const actor = actorMention(entry);
  switch (entry.command) {
    case 'announce':
      return `${actor} announced: "${entry.message}"`;
    case 'kick':
      return `${actor} kicked \`${entry.target}\` — ${entry.reason}`;
    case 'ban':
      return `${actor} banned \`${entry.target}\` — ${entry.reason}`;
    case 'unban':
      return `${actor} unbanned \`${entry.target}\``;
    case 'save':
      return `${actor} saved the world`;
    case 'start':
      return `${actor} started the server`;
    case 'restart':
      return `${actor} restarted the server`;
    case 'stop':
      return `${actor} stopped the server${entry.force ? ' (force)' : ''}`;
    case 'operator': {
      const verb = entry.action.startsWith('add') ? 'granted operator to' : 'revoked operator from';
      const mention = entry.targetType === 'role' ? `<@&${entry.target}>` : `<@${entry.target}>`;
      return `${actor} ${verb} ${mention}`;
    }
    default:
      return `${actor} ran ${entry.command}`;
  }
}

async function postToChannel(client, channelId, content) {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send(content);
  } catch (err) {
    console.error(`Failed to post to channel ${channelId}:`, err.message);
  }
}

// getChannels is a function, not a static array, so this always sees the
// latest hot-reloaded config.channels rather than a stale snapshot from
// whenever createNotifier() was called.
function createNotifier(client, getChannels) {
  return {
    botLog(guildId, content) {
      const channels = findGuildChannels(getChannels(), guildId);
      return postToChannel(client, channels?.botChannelId, content);
    },
    serverLog(guildId, content) {
      const channels = findGuildChannels(getChannels(), guildId);
      return postToChannel(client, channels?.serverChannelId, content);
    },
  };
}

module.exports = { createNotifier, findGuildChannels, formatAuditEntry };
