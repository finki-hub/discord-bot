import { logger } from '@/common/logger/index.js';

const shutdown = () => {
  logger.info('Shutting down gracefully...');

  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- the bot intentionally exits after graceful shutdown signals
  process.exit(0);
};

export const attachProcessListeners = () => {
  process.on('SIGINT', () => shutdown());

  process.on('SIGTERM', () => shutdown());

  process.on('uncaughtException', (error) => {
    logger.error(`Bot has been shut down with error ${error.message}`);
  });

  process.on('warning', (warning) => {
    logger.warn(warning);
  });

  process.on('beforeExit', () => {
    logger.info('Exiting...');
  });

  process.on('exit', () => {
    logger.info('Goodbye.');
  });
};
