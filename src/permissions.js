const TIER_RANK = { common: 1, operator: 2, admin: 3 };

function findGuildRoles(guilds, guildId) {
  return guilds.find((guild) => guild.guildId === guildId) || null;
}

function memberMatchesTier(member, tier) {
  if (!tier) return false;
  return (
    member.roleIds.some((id) => tier.roleIds.includes(id)) ||
    tier.userIds.includes(member.userId)
  );
}

function resolveTier(member, roles) {
  if (!roles) return null;
  if (memberMatchesTier(member, roles.admin)) return 'admin';
  if (memberMatchesTier(member, roles.operator)) return 'operator';
  if (memberMatchesTier(member, roles.common)) return 'common';
  return null;
}

function hasAccess(memberTier, requiredTier) {
  if (!memberTier) return false;
  return TIER_RANK[memberTier] >= TIER_RANK[requiredTier];
}

module.exports = { resolveTier, hasAccess, findGuildRoles, TIER_RANK };
