const { EmbedBuilder } = require('discord.js');
const { getSystemStats } = require('./systemStats');

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

async function buildStatusEmbed(palworld) {
  const [info, { players }, metrics] = await Promise.all([
    palworld.getInfo(),
    palworld.getPlayers(),
    palworld.getMetrics(),
  ]);
  const system = getSystemStats();

  const embed = new EmbedBuilder()
    .setTitle(info.servername)
    .setColor(0x2ecc71)
    .addFields(
      { name: 'Version', value: info.version, inline: true },
      { name: 'Players', value: `${players.length}/${metrics.maxplayernum}`, inline: true },
      { name: 'In-game day', value: String(metrics.days), inline: true },
      { name: 'Server FPS', value: `${metrics.serverfps} (${metrics.serverframetime.toFixed(1)}ms)`, inline: true },
      { name: 'Server uptime', value: formatUptime(metrics.uptime), inline: true },
      { name: 'VM CPU load (1m avg)', value: `${system.cpuLoad1m.toFixed(2)} / ${system.cpuCount} cores`, inline: true },
      { name: 'VM memory', value: `${system.memUsedMb}MB / ${system.memTotalMb}MB`, inline: true },
    )
    .setTimestamp();

  if (info.description) embed.setDescription(info.description);
  return embed;
}

module.exports = { buildStatusEmbed, formatUptime };
