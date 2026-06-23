import { Cron } from 'croner';

import { logger } from '@/common/logger/index.js';
import { labels } from '@/translations/labels.js';

import { DATE_FORMATTER, TICKETS_CHECK_INTERVAL } from './utils/constants.js';
import { maintainTickets } from './utils/tickets.js';

const convertMillisecondsToCronJob = (ms: number) => {
  if (ms < 60_000) {
    return `*/${ms / 1_000} * * * * *`;
  }

  if (ms < 3_600_000) {
    return `*/${ms / 60_000} * * * *`;
  }

  if (ms < 86_400_000) {
    return `0 */${ms / 3_600_000} * * *`;
  }

  if (ms < 2_592_000_000) {
    return `0 0 */${ms / 86_400_000} * *`;
  }

  if (ms < 31_536_000_000) {
    return `0 0 0 */${ms / 2_592_000_000} *`;
  }

  return '0 0 0 0 0';
};

export const init = () => {
  const cronJobs: Cron[] = [
    new Cron(
      convertMillisecondsToCronJob(TICKETS_CHECK_INTERVAL),
      { name: 'maintainTickets' },
      maintainTickets,
    ),
  ];

  for (const job of cronJobs) {
    const nextRunDate = job.nextRun();
    const nextRun =
      nextRunDate === null
        ? labels.unknown
        : DATE_FORMATTER.format(nextRunDate);

    logger.info(
      `Cron job ${job.name ?? labels.unknown} initialized. Next run: ${nextRun}`,
    );
  }
};
