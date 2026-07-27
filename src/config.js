const fs = require('node:fs');
const path = require('node:path');

function normalizeTier(tier) {
  return {
    roleIds: Array.isArray(tier?.roleIds) ? tier.roleIds : [],
    userIds: Array.isArray(tier?.userIds) ? tier.userIds : [],
  };
}

function loadGuildsFile(guildsPath) {
  if (!fs.existsSync(guildsPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(guildsPath, 'utf8'));
  const guilds = Array.isArray(parsed) ? parsed : [];
  return guilds.map((guild) => ({
    guildId: guild.guildId,
    admin: normalizeTier(guild.admin),
    operator: normalizeTier(guild.operator),
  }));
}

function ensureGuildEntry(guildsPath, guildId) {
  const guilds = loadGuildsFile(guildsPath);
  if (guilds.some((guild) => guild.guildId === guildId)) return false;

  guilds.push({
    guildId,
    admin: { roleIds: [], userIds: [] },
    operator: { roleIds: [], userIds: [] },
  });
  fs.mkdirSync(path.dirname(guildsPath), { recursive: true });
  fs.writeFileSync(guildsPath, JSON.stringify(guilds, null, 2));
  return true;
}

function loadConfig(env = process.env) {
  const guildsPath = env.GUILDS_CONFIG_PATH || path.join(__dirname, '..', 'config', 'guilds.json');
  return {
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    restApiUrl: env.PALWORLD_REST_URL || 'http://localhost:8212',
    restApiPassword: env.PALWORLD_ADMIN_PASSWORD,
    pm2ProcessName: env.PALWORLD_PM2_NAME || 'palworld',
    auditLogPath: env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'data', 'audit-log.json'),
    guildsPath,
    guilds: loadGuildsFile(guildsPath),
  };
}

module.exports = { loadConfig, loadGuildsFile, ensureGuildEntry };
