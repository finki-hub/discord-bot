import { logger } from '@/common/logger/index.js';
import { initializeChannels } from '@/common/services/channels.js';
import { type BotConfigKeys } from '@/modules/admin/schemas/BotConfig.js';

export const refreshOnConfigChange = async (
  property: BotConfigKeys,
  guildId: string,
) => {
  logger.info(
    `Config property ${property} changed for guild ${guildId}, refreshing...`,
  );

  if (property === 'channels') {
    await initializeChannels(guildId);
  } else {
    logger.info(`No refresh needed for ${property}`);
  }
};
