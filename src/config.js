const fs = require('node:fs');
const path = require('node:path');

function normalizeTier(tier) {
  return {
    roleIds: Array.isArray(tier?.roleIds) ? tier.roleIds : [],
    userIds: Array.isArray(tier?.userIds) ? tier.userIds : [],
  };
}

function loadGuildsFile(guildsPath) {
  const parsed = JSON.parse(fs.readFileSync(guildsPath, 'utf8'));
  const guilds = Array.isArray(parsed) ? parsed : [];
  return guilds.map((guild) => ({
    guildId: guild.guildId,
    admin: normalizeTier(guild.admin),
    operator: normalizeTier(guild.operator),
  }));
}

function loadConfig(env = process.env) {
  const guildsPath = env.GUILDS_CONFIG_PATH || path.join(__dirname, '..', 'config', 'guilds.json');
  return {
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    restApiUrl: env.PALWORLD_REST_URL || 'http://localhost:8212',
    restApiPassword: env.PALWORLD_ADMIN_PASSWORD,
    systemdUnit: env.PALWORLD_SYSTEMD_UNIT || 'palworld.service',
    auditLogPath: env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'data', 'audit-log.json'),
    guilds: loadGuildsFile(guildsPath),
  };
}

module.exports = { loadConfig, loadGuildsFile };
