import { type ClientEvents, Events } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { initializeChannels } from '@/common/services/channels.js';

import { client as bot } from '../client.js';

export const name = Events.ClientReady;
export const once = true;

export const execute = async (...[client]: ClientEvents[typeof name]) => {
  await client.guilds.fetch();

  for (const guild of client.guilds.cache.values()) {
    await initializeChannels(guild.id);
  }

  await client.application.commands.fetch();

  logger.info(
    `Bot is ready! Logged in as ${bot.user?.tag ?? 'an unknown user'}`,
  );
  logger.info(
    `Bot successfully started at ${Temporal.Now.instant().toString()}`,
  );
};
