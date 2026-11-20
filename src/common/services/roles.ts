import { type Role as DiscordRole, type Guild } from 'discord.js';

const fetchedGuilds = new WeakSet<Guild>();
const inFlightMemberFetches = new WeakMap<Guild, Promise<void>>();

const ensureGuildMembersFetched = async (guild: Guild): Promise<void> => {
  if (fetchedGuilds.has(guild)) {
    return;
  }

  const existingFetch = inFlightMemberFetches.get(guild);
  if (existingFetch !== undefined) {
    await existingFetch;
    return;
  }

  const fetchPromise = (async () => {
    await guild.members.fetch();
    fetchedGuilds.add(guild);
  })();

  inFlightMemberFetches.set(guild, fetchPromise);

  try {
    await fetchPromise;
  } finally {
    inFlightMemberFetches.delete(guild);
  }
};

const getMembersByRoles = (rolesWithMembers: DiscordRole[]) => {
  const uniqueMembers = new Set<string>();

  for (const role of rolesWithMembers) {
    for (const memberId of role.members.keys()) {
      uniqueMembers.add(memberId);
    }
  }

  return Array.from(uniqueMembers);
};

export const getMembersByRoleIds = async (
  guild: Guild,
  roleIdsWithMembers: string[],
): Promise<string[]> => {
  if (roleIdsWithMembers.length === 0) {
    return [];
  }

  await Promise.all([guild.roles.fetch(), ensureGuildMembersFetched(guild)]);

  const rolesList = roleIdsWithMembers
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role) => role !== undefined);

  return getMembersByRoles(rolesList);
};
