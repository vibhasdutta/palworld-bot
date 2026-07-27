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

// Each guild's Palworld connection(s) -- a guild can list zero, one, or many
// servers, each identified by a short `label`. A guild with no complete
// server entries is structurally incapable of controlling anything,
// regardless of what roles.json grants -- this is the multi-tenancy
// boundary, not just an allowlist bolted on top.
function normalizeServer(server) {
  return {
    label: server.label || null,
    restApiUrl: server.restApiUrl || null,
    restApiPassword: server.restApiPassword || null,
    pm2ProcessName: server.pm2ProcessName || null,
  };
}

function loadServersFile(serversPath) {
  return readJsonArray(serversPath).map((entry) => ({
    guildId: entry.guildId,
    servers: Array.isArray(entry.servers) ? entry.servers.map(normalizeServer) : [],
  }));
}

function isCompleteServer(server) {
  return Boolean(server?.label && server.restApiUrl && server.pm2ProcessName);
}

// Every complete (fully-configured) server for a guild -- what /status etc.
// offer as autocomplete choices for the `server` option.
function findGuildServers(servers, guildId) {
  const entry = servers.find((s) => s.guildId === guildId);
  return entry ? entry.servers.filter(isCompleteServer) : [];
}

// Resolves which single server a command should act on.
// - No label given + exactly one server configured -> that one (the common
//   case: most guilds only ever have one server, no need to specify it).
// - No label given + zero or multiple servers -> null (ambiguous or
//   unconfigured; the caller decides how to explain that).
// - Label given -> that specific server, or null if no match.
function findGuildServer(servers, guildId, label) {
  const available = findGuildServers(servers, guildId);
  if (label) return available.find((s) => s.label === label) || null;
  return available.length === 1 ? available[0] : null;
}

// Registers a newly-seen guild across all four config files with empty/no-op
// defaults (no roles granted, no channels to post to, no server to control)
// so the human only ever has to *edit* values, never create the entries by
// hand. Returns true the first time a guild is seen, false on every call after.
function ensureGuildEntry(guildsPath, rolesPath, channelsPath, serversPath, guildId) {
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

  const servers = readJsonArray(serversPath);
  writeJsonArray(serversPath, [...servers, { guildId, servers: [] }]);

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
  const serversPath = env.SERVERS_CONFIG_PATH || path.join(configDir, 'servers.json');

  return {
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    auditLogPath: env.AUDIT_LOG_PATH || path.join(__dirname, '..', 'data', 'audit-log.json'),
    guildsPath,
    rolesPath,
    channelsPath,
    serversPath,
    guilds: loadGuildsFile(guildsPath),
    roles: loadRolesFile(rolesPath),
    channels: loadChannelsFile(channelsPath),
    servers: loadServersFile(serversPath),
  };
}

module.exports = {
  loadConfig,
  loadGuildsFile,
  loadRolesFile,
  loadChannelsFile,
  loadServersFile,
  findGuildServer,
  findGuildServers,
  ensureGuildEntry,
  mutateGuildRoles,
};
