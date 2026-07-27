function findGuildChannels(channels, guildId) {
  return channels.find((c) => c.guildId === guildId) || null;
}

function formatAuditEntry(entry) {
  switch (entry.command) {
    case 'announce':
      return `**${entry.actor}** announced: "${entry.message}"`;
    case 'kick':
      return `**${entry.actor}** kicked \`${entry.target}\` — ${entry.reason}`;
    case 'ban':
      return `**${entry.actor}** banned \`${entry.target}\` — ${entry.reason}`;
    case 'unban':
      return `**${entry.actor}** unbanned \`${entry.target}\``;
    case 'save':
      return `**${entry.actor}** saved the world`;
    case 'start':
      return `**${entry.actor}** started the server`;
    case 'restart':
      return `**${entry.actor}** restarted the server`;
    case 'stop':
      return `**${entry.actor}** stopped the server${entry.force ? ' (force)' : ''}`;
    default:
      return `**${entry.actor}** ran ${entry.command}`;
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
