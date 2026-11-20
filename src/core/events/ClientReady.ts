import { type ClientEvents, Events } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { trackLifecycle } from '@/common/services/analytics.js';
import { initializeChannels } from '@/common/services/channels.js';

import { client as bot } from '../client.js';

export const name = Events.ClientReady;
export const once = true;

export const execute = async (...[client]: ClientEvents[typeof name]) => {
  await client.guilds.fetch();

  // Each guild's channels are independent of the others'.
  await Promise.all(
    client.guilds.cache
      .values()
      .map(async (guild) => initializeChannels(guild.id)),
  );

  await client.application.commands.fetch();

  trackLifecycle('bot_ready', { guildCount: client.guilds.cache.size });

  logger.info(
    `Bot is ready! Logged in as ${bot.user?.tag ?? 'an unknown user'}`,
  );
  logger.info(
    `Bot successfully started at ${Temporal.Now.instant().toString()}`,
  );
};
