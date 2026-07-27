const fs = require('node:fs');
const path = require('node:path');

function normalizeTier(tier) {
  return {
    roleIds: Array.isArray(tier?.roleIds) ? tier.roleIds : [],
    userIds: Array.isArray(tier?.userIds) ? tier.userIds : [],
  };
}

function loadRolesFile(rolesPath) {
  const parsed = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
  return {
    admin: normalizeTier(parsed.admin),
    operator: normalizeTier(parsed.operator),
  };
}

function loadConfig(env = process.env) {
  const rolesPath = env.ROLES_CONFIG_PATH || path.join(__dirname, '..', 'config', 'roles.json');
  return {
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    guildId: env.DISCORD_GUILD_ID,
    restApiUrl: env.PALWORLD_REST_URL || 'http://localhost:8212',
    restApiPassword: env.PALWORLD_ADMIN_PASSWORD,
    systemdUnit: env.PALWORLD_SYSTEMD_UNIT || 'palworld.service',
    auditLogPath: env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'data', 'audit-log.json'),
    roles: loadRolesFile(rolesPath),
  };
}

module.exports = { loadConfig, loadRolesFile };
