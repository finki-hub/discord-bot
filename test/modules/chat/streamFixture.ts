import { vi } from 'vitest';

import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

export const installFetchQueue = (responses: Response[]): void => {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const response = queue.shift();
      if (response === undefined) {
        throw new Error('The test exhausted its mocked fetch queue');
      }
      return response;
    }),
  );
};

export const streamOptionsFor = (userId: string) =>
  ({
    embeddings_model: undefined,
    inference_model: undefined,
    interface: 'discord',
    max_tokens: undefined,
    messages: [{ content: 'question', role: 'user' as const }],
    reasoning: undefined,
    temperature: undefined,
    top_p: undefined,
    user_id: userId,
  }) satisfies SendPromptOptions;
