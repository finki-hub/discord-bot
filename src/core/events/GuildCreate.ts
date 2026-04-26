import { type ClientEvents, Events } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { initializeChannels } from '@/common/services/channels.js';

export const name = Events.GuildCreate;
export const once = false;

export const execute = (...[guild]: ClientEvents[typeof name]) => {
  logger.info(`Joined guild: ${guild.name} (${guild.id})`);
  return initializeChannels(guild.id);
};
