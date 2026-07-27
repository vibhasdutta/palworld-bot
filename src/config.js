const fs = require('node:fs');
const path = require('node:path');

function normalizeTier(tier) {
  return {
    roleIds: Array.isArray(tier?.roleIds) ? tier.roleIds : [],
    userIds: Array.isArray(tier?.userIds) ? tier.userIds : [],
  };
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function writeJsonArray(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

function loadGuildsFile(guildsPath) {
  return readJsonArray(guildsPath).map((guild) => ({ guildId: guild.guildId }));
}

function loadRolesFile(rolesPath) {
  return readJsonArray(rolesPath).map((entry) => ({
    guildId: entry.guildId,
    admin: normalizeTier(entry.admin),
    operator: normalizeTier(entry.operator),
  }));
}

function loadChannelsFile(channelsPath) {
  return readJsonArray(channelsPath).map((entry) => ({
    guildId: entry.guildId,
    botChannelId: entry.botChannelId || null,
    serverChannelId: entry.serverChannelId || null,
  }));
}

// Registers a newly-seen guild across all three config files with empty/no-op
// defaults (no roles granted, no channels to post to) so the human only ever
// has to *edit* values, never create the entries by hand. Returns true the
// first time a guild is seen, false on every call after.
function ensureGuildEntry(guildsPath, rolesPath, channelsPath, guildId) {
  const guilds = readJsonArray(guildsPath);
  if (guilds.some((g) => g.guildId === guildId)) return false;

  writeJsonArray(guildsPath, [...guilds, { guildId }]);

  const roles = readJsonArray(rolesPath);
  writeJsonArray(rolesPath, [
    ...roles,
    { guildId, admin: { roleIds: [], userIds: [] }, operator: { roleIds: [], userIds: [] } },
  ]);

  const channels = readJsonArray(channelsPath);
  writeJsonArray(channelsPath, [...channels, { guildId, botChannelId: '', serverChannelId: '' }]);

  return true;
}

// Reads roles.json, applies `mutate` to the (guild-specific) tier entry --
// creating it with empty defaults first if this guild somehow isn't
// registered yet -- and writes the result straight back. Used by the
// /operator command so admins can grant/revoke access from Discord instead
// of editing config/roles.json over SSH.
function mutateGuildRoles(rolesPath, guildId, mutate) {
  const roles = loadRolesFile(rolesPath);
  let entry = roles.find((r) => r.guildId === guildId);
  if (!entry) {
    entry = { guildId, admin: { roleIds: [], userIds: [] }, operator: { roleIds: [], userIds: [] } };
    roles.push(entry);
  }
  mutate(entry);
  writeJsonArray(rolesPath, roles);
  return entry;
}

function loadConfig(env = process.env) {
  const configDir = env.CONFIG_DIR || path.join(__dirname, '..', 'config');
  const guildsPath = env.GUILDS_CONFIG_PATH || path.join(configDir, 'guilds.json');
  const rolesPath = env.ROLES_CONFIG_PATH || path.join(configDir, 'roles.json');
  const channelsPath = env.CHANNELS_CONFIG_PATH || path.join(configDir, 'channels.json');

  return {
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    restApiUrl: env.PALWORLD_REST_URL || 'http://localhost:8212',
    restApiPassword: env.PALWORLD_ADMIN_PASSWORD,
    pm2ProcessName: env.PALWORLD_PM2_NAME || 'palworld',
    auditLogPath: env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'data', 'audit-log.json'),
    guildsPath,
    rolesPath,
    channelsPath,
    guilds: loadGuildsFile(guildsPath),
    roles: loadRolesFile(rolesPath),
    channels: loadChannelsFile(channelsPath),
  };
}

module.exports = {
  loadConfig,
  loadGuildsFile,
  loadRolesFile,
  loadChannelsFile,
  ensureGuildEntry,
  mutateGuildRoles,
};
