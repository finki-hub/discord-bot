import { type ClientEvents, Events } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { trackLifecycle } from '@/common/services/analytics.js';

export const name = Events.GuildDelete;
export const once = false;

export const execute = (...[guild]: ClientEvents[typeof name]) => {
  logger.info(`Left guild: ${guild.name} (${guild.id})`);
  trackLifecycle('bot_guild_removed', {
    guildId: guild.id,
    memberCount: guild.memberCount,
  });
};
