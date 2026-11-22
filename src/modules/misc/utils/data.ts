import { randomInt } from 'node:crypto';
import { z } from 'zod';

import {
  loadDirectusItems,
  schedulePeriodicReload,
} from '@/common/utils/data.js';

const state: { quotes: string[] } = {
  quotes: [],
};

const QuotesSchema = z
  .array(z.object({ quote: z.string() }))
  .transform((rows) =>
    rows.map(({ quote }) => quote.trim()).filter((quote) => quote !== ''),
  );

export const reloadQuotes = async () => {
  await loadDirectusItems({
    collection: 'anto_quotes',
    fields: ['quote'],
    label: 'anto quotes',
    onLoaded: (data: string[]) => {
      state.quotes = data;
    },
    schema: QuotesSchema,
  });
};

export const startPeriodicReload = () => {
  schedulePeriodicReload({
    label: 'anto quotes',
    reload: reloadQuotes,
  });
};

export const getRandomQuote = (): string | undefined => {
  if (state.quotes.length === 0) {
    return undefined;
  }

  const randomIndex = randomInt(state.quotes.length);
  return state.quotes[randomIndex];
};
