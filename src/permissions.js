const TIER_RANK = { operator: 1, admin: 2 };

function findGuildRoles(guilds, guildId) {
  return guilds.find((guild) => guild.guildId === guildId) || null;
}

function memberMatchesTier(member, tier) {
  return (
    member.roleIds.some((id) => tier.roleIds.includes(id)) ||
    tier.userIds.includes(member.userId)
  );
}

function resolveTier(member, roles) {
  if (!roles) return null;
  if (memberMatchesTier(member, roles.admin)) return 'admin';
  if (memberMatchesTier(member, roles.operator)) return 'operator';
  return null;
}

function hasAccess(memberTier, requiredTier) {
  if (!memberTier) return false;
  return TIER_RANK[memberTier] >= TIER_RANK[requiredTier];
}

module.exports = { resolveTier, hasAccess, findGuildRoles, TIER_RANK };
