import { logger } from '@/common/logger/index.js';
import { shutdownAnalytics } from '@/common/services/analytics.js';

const shutdown = async () => {
  logger.info('Shutting down gracefully...');

  let code = 0;

  try {
    await shutdownAnalytics();
  } catch (error) {
    logger.error(`Failed shutting down gracefully\n${String(error)}`);
    code = 1;
  }

  // eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit -- the bot intentionally exits after graceful shutdown signals
  process.exit(code);
};

export const attachProcessListeners = () => {
  process.on('SIGINT', shutdown);

  process.on('SIGTERM', shutdown);

  process.on('uncaughtException', async (error) => {
    logger.error(`Bot has been shut down with error ${error.message}`);

    try {
      await shutdownAnalytics();
    } finally {
      // eslint-disable-next-line n/no-process-exit -- the bot intentionally exits after flushing analytics for uncaught exceptions
      process.exit(1);
    }
  });

  process.on('unhandledRejection', async (reason) => {
    logger.error(
      `Bot has been shut down with unhandled rejection: ${String(reason)}`,
    );

    try {
      await shutdownAnalytics();
    } finally {
      // eslint-disable-next-line n/no-process-exit -- the bot intentionally exits after flushing analytics for unhandled rejections
      process.exit(1);
    }
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
