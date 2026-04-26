import { logger } from '@/common/logger/index.js';
import { reloadConfig } from '@/configuration/bot/index.js';
import { getToken } from '@/configuration/environment.js';

import { client } from './client.js';
import { registerCommands } from './commands/modules.js';
import { attachEventListeners } from './utils/events.js';
import { initializeModules } from './utils/modules.js';
import { attachProcessListeners } from './utils/process.js';

export const bootstrap = async () => {
  logger.info('Starting bot initialization...');

  process.loadEnvFile();
  logger.debug('Environment variables loaded');

  attachProcessListeners();
  logger.debug('Process listeners attached');

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
