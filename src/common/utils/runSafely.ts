import { logger } from '@/common/logger/index.js';
import { captureException } from '@/common/services/analytics.js';
import { errorCategory } from '@/common/utils/safeError.js';

type BackgroundContext = {
  guildId?: string;
};

// Fire-and-forget work must never reject: the process treats an unhandled
// rejection as fatal.
export const runSafely = async (
  label: string,
  operation: () => Promise<unknown>,
  context: BackgroundContext = {},
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    logger.error(`${label} failed (${errorCategory(error)})`, context);
    captureException(error, null, { phase: 'background_task' });
  }
};
