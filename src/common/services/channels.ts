import { type GuildTextBasedChannel } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { client } from '@/core/client.js';

import { type Channel, ChannelSchema } from '../schemas/Channel.js';

const channels: Record<
  string,
  Partial<Record<Channel, GuildTextBasedChannel | undefined>>
> = {};

export const initializeChannels = async (guildId: string) => {
  const channelIds = await getConfigProperty('channels', guildId);

  if (channelIds === undefined) {
    return;
  }

  const guildChannels: Partial<
    Record<Channel, GuildTextBasedChannel | undefined>
  > = {};

  for (const [channelName, channelId] of Object.entries(channelIds)) {
    const channelType = ChannelSchema.safeParse(channelName);

    if (channelId === undefined || !channelType.success) {
      continue;
    }

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel?.isTextBased() || channel.isDMBased()) {
        logger.warn(`Channel ${channelId} is not a guild text-based channel`, {
          guildId,
        });
        continue;
      }

      guildChannels[channelType.data] = channel;
    } catch (error) {
      logger.error(`Failed fetching channel ${channelId}\n${String(error)}`, {
        guildId,
      });
    }
  }

  channels[guildId] = guildChannels;
  logger.info(`Channels initialized for guild ${guildId}`);
};

export const getChannel = (type: Channel, guildId: string) =>
  channels[guildId]?.[type];
