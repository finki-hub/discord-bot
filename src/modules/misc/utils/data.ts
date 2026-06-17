import { randomInt } from 'node:crypto';
import { z } from 'zod';

import {
  loadJsonResource,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

const state: { quotes: string[] } = {
  quotes: [],
};

const QuotesSchema = z.array(z.string());

export const reloadQuotes = async () => {
  await loadJsonResource({
    label: 'anto quotes',
    onLoaded: (data: string[]) => {
      state.quotes = data;
    },
    resource: 'anto.json',
    schema: QuotesSchema,
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({ label: 'anto quotes', reload: reloadQuotes });
};

export const getQuotes = (): string[] => state.quotes;

export const getRandomQuote = (): string | undefined => {
  if (state.quotes.length === 0) {
    return undefined;
  }

  const randomIndex = randomInt(state.quotes.length);
  return state.quotes[randomIndex];
};
