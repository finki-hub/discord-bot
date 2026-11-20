import { type Role as DiscordRole, type Guild } from 'discord.js';

// Fetching every member of a guild is expensive, so a guild's in-flight or
// completed fetch is kept here: concurrent calls share one request and later
// calls reuse the completed fetch, while a failed fetch is dropped so it can
// be retried. The GuildMembers intent keeps the cache current afterwards, but
// Discord omits members from GUILD_CREATE for large guilds, so a fresh
// identify resets the cache rather than trusting data from the last session.
const memberFetches = new WeakMap<Guild, Promise<void>>();

const ensureGuildMembersFetched = async (guild: Guild): Promise<void> => {
  const existingFetch = memberFetches.get(guild);

  if (existingFetch !== undefined) {
    await existingFetch;
    return;
  }

  const memberFetch = (async () => {
    await guild.members.fetch();
  })();

  memberFetches.set(guild, memberFetch);

  try {
    await memberFetch;
  } catch (error) {
    memberFetches.delete(guild);
    throw error;
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

export const resetGuildMembersCache = (guilds: Iterable<Guild>): void => {
  for (const guild of guilds) {
    memberFetches.delete(guild);
  }
};
