import { type Role as DiscordRole, type Guild } from 'discord.js';

// Fetching every member of a guild is expensive, so a guild's in-flight or
// completed fetch is kept here: concurrent calls share one request and later
// calls reuse the completed fetch, while a failed fetch is dropped so it can
// be retried. The GuildMembers intent keeps the cache current afterwards, but
// Discord omits members from GUILD_CREATE for large guilds, so a fresh
// identify forgets the fetch and the next lookup reconciles the cache with
// the guild.
const memberFetches = new WeakMap<Guild, Promise<void>>();

const ensureGuildMembersFetched = async (guild: Guild): Promise<void> => {
  const existingFetch = memberFetches.get(guild);

  if (existingFetch !== undefined) {
    await existingFetch;
    return;
  }

  const memberFetch = (async () => {
    // `fetch()` only adds or updates members. Keep the ids cached before the
    // request so members who left while the bot was offline can be removed
    // without dropping anyone who joined while the request was in flight.
    const previouslyCachedMemberIds = new Set(guild.members.cache.keys());
    const members = await guild.members.fetch();

    for (const memberId of previouslyCachedMemberIds) {
      if (!members.has(memberId)) {
        guild.members.cache.delete(memberId);
      }
    }
  })();

  memberFetches.set(guild, memberFetch);

  try {
    await memberFetch;
  } catch (error) {
    if (memberFetches.get(guild) === memberFetch) {
      memberFetches.delete(guild);
    }
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

  await guild.roles.fetch();

  const rolesList = roleIdsWithMembers
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role) => role !== undefined);

  if (rolesList.length === 0) {
    return [];
  }

  await ensureGuildMembersFetched(guild);

  return getMembersByRoles(rolesList);
};

// Forget the memo for these guilds so the next lookup refetches their members
// and drops anyone who left while the bot was offline.
export const resetGuildMembersCache = (guilds: Iterable<Guild>): void => {
  for (const guild of guilds) {
    memberFetches.delete(guild);
  }
};
