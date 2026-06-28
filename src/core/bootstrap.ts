import { logger } from '@/common/logger/index.js';
import { initAnalytics } from '@/common/services/analytics.js';
import { reloadConfig } from '@/configuration/bot/index.js';
import { getToken } from '@/configuration/environment.js';

import { client } from './client.js';
import { registerCommands } from './commands/modules.js';
import { attachEventListeners } from './utils/events.js';
import { initializeModules } from './utils/modules.js';
import { attachProcessListeners } from './utils/process.js';

export const bootstrap = async () => {
  logger.info('Starting bot initialization...');

  try {
    process.loadEnvFile();
    logger.debug('Environment variables loaded from .env file');
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    ) {
      throw error;
    }

    logger.debug('No .env file found, using platform environment variables');
  }

  attachProcessListeners();
  logger.debug('Process listeners attached');

  initAnalytics();

  await Promise.all([
    reloadConfig(),
    initializeModules(),
    registerCommands(),
    attachEventListeners(),
  ]);
  logger.debug(
    'Configuration loaded, modules initialized, commands registered, and event listeners attached',
  );

  logger.info('Attempting to login to Discord...');
  try {
    await client.login(getToken());
  } catch (error) {
    const errorMessage = `Failed logging in\n${String(error)}`;
    logger.error(errorMessage);
    throw new Error(errorMessage, { cause: error });
  }
};
