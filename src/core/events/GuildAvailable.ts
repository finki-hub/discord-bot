import { type ClientEvents, Events } from 'discord.js';

import { resetGuildMembersCache } from '@/common/services/roles.js';

export const name = Events.GuildAvailable;
export const once = false;

export const execute = (...[guild]: ClientEvents[typeof name]) => {
  // A guild can become available after an outage without a new shard session;
  // large guilds may not resend their members, so refetch on the next lookup.
  resetGuildMembersCache([guild]);
};
