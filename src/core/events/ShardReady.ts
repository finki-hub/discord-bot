import { type ClientEvents, Events } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { resetGuildMembersCache } from '@/common/services/roles.js';

import { client as bot } from '../client.js';

export const name = Events.ShardReady;
export const once = false;

export const execute = (...[shardId]: ClientEvents[typeof name]) => {
  logger.info(`Shard ${shardId} is ready`);

  // A fresh identify does not resend members for large guilds, so cached guild
  // member fetches may be from before the session.
  resetGuildMembersCache(
    bot.guilds.cache
      .filter((guild) => guild.shardId === shardId)
      .values()
      .toArray(),
  );
};
