import { type Role as DiscordRole, type Guild } from 'discord.js';

const getMembersByRoles = async (
  guild: Guild,
  rolesWithMembers: DiscordRole[],
) => {
  await guild.roles.fetch();

  const members = rolesWithMembers.map((role) => role.members.keys());

  const uniqueMembers = new Set<string>();
  for (const iterator of members) {
    const ids = Array.from(iterator);

    for (const id of ids) {
      uniqueMembers.add(id);
    }
  }

  return Array.from(uniqueMembers);
};

export const getMembersByRoleIds = (
  guild: Guild,
  roleIdsWithMembers: string[],
) => {
  const rolesList = roleIdsWithMembers
    .map((role) => guild.roles.cache.get(role))
    .filter((role) => role !== undefined);

  return getMembersByRoles(guild, rolesList);
};
