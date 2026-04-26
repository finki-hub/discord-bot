import { Cron } from 'croner';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

import { logger } from '@/common/logger/index.js';
import { fetchJsonFromUrl, parseContent } from '@/common/utils/data.js';
import { getDataStorageUrl } from '@/configuration/environment.js';

let quotes: string[] = [];
let reloadCron: Cron | null = null;

export const reloadQuotes = async () => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.warn(
      'DATA_STORAGE_URL not configured, anto quotes data loading disabled',
    );
    return;
  }

  try {
    const antoUrl = `${baseUrl}/anto.json`;

    let antoRaw: string;

    try {
      antoRaw = await fetchJsonFromUrl(antoUrl);
    } catch (error) {
      logger.error(
        `Failed fetching anto quotes from data storage\n${String(error)}`,
      );
      throw error;
    }

    const quotesData = parseContent(antoRaw);
    const quotesResult = z.array(z.string()).safeParse(quotesData);
    const quotesParsed = quotesResult.success ? quotesResult.data : [];

    quotes = quotesParsed;
    logger.info('Anto quotes data reloaded from data storage');
  } catch (error) {
    logger.error(`Failed reloading anto quotes\n${String(error)}`);
    throw error;
  }
};

export const startPeriodicReload = () => {
  const baseUrl = getDataStorageUrl();

  if (!baseUrl) {
    logger.debug(
      'DATA_STORAGE_URL not configured, periodic anto quotes reload disabled',
    );
    return;
  }

  if (reloadCron) {
    reloadCron.stop();
  }

  // Reload every hour
  reloadCron = new Cron('0 * * * *', async () => {
    logger.info('Starting scheduled anto quotes reload from data storage...');
    try {
      await reloadQuotes();
    } catch (error) {
      logger.error(`Scheduled anto quotes reload failed\n${String(error)}`);
    }
  });

  logger.info('Periodic anto quotes reload scheduled (every hour)');
};

export const getQuotes = (): string[] => quotes;

export const getRandomQuote = (): string | undefined => {
  if (quotes.length === 0) {
    return undefined;
  }

  const randomIndex = randomInt(quotes.length);
  return quotes[randomIndex];
};
