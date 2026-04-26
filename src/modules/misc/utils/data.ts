import { randomInt } from 'node:crypto';
import { z } from 'zod';

import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

let quotes: string[] = [];

const QuotesSchema = z.array(z.string());

export const reloadQuotes = async () => {
  await loadJsonResource({
    label: 'anto quotes',
    onLoaded: (data: string[]) => {
      quotes = data;
    },
    resource: 'anto.json',
    schema: QuotesSchema,
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'anto quotes', reload: reloadQuotes });
};

export const getQuotes = (): string[] => quotes;

export const getRandomQuote = (): string | undefined => {
  if (quotes.length === 0) {
    return undefined;
  }

  const randomIndex = randomInt(quotes.length);
  return quotes[randomIndex];
};
