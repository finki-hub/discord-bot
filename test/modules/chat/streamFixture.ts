import { vi } from 'vitest';

import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

export const installFetchQueue = (responses: Response[]): void => {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const response = queue.shift();
      return response === undefined
        ? Promise.reject(new Error('The test exhausted its mocked fetch queue'))
        : Promise.resolve(response);
    }),
  );
};

export const streamOptionsFor = (userId: string) =>
  ({
    embeddings_model: undefined,
    inference_model: undefined,
    interface: 'discord',
    messages: [{ content: 'question', role: 'user' as const }],
    reasoning: undefined,
    user_id: userId,
  }) satisfies SendPromptOptions;
