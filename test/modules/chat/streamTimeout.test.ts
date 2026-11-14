import { expect, test, vi } from 'vitest';

import { CHAT_STREAM_IDLE_TIMEOUT_MS } from '@/modules/chat/utils/constants.js';
import {
  invalidateModelCatalog,
  sendPrompt,
} from '@/modules/chat/utils/requests.js';

import { streamOptionsFor } from './streamFixture.js';

const USER_ID = 'stream-timeout-user';

test('times out a response stream that stops producing data', async () => {
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  vi.stubEnv('API_KEY', 'test-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start() {
              // Keep the stream open without producing any chunks.
            },
          }),
        ),
    ),
  );

  vi.useFakeTimers();
  try {
    const prompt = sendPrompt(
      streamOptionsFor(USER_ID),
      'conversation-id',
      async () => {},
    );

    await Promise.all([
      expect(prompt).rejects.toThrow('LLM_TIMEOUT'),
      (async () => {
        // Let fetch resolve and the first read start before advancing the clock.
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(CHAT_STREAM_IDLE_TIMEOUT_MS + 1);
      })(),
    ]);
  } finally {
    invalidateModelCatalog(USER_ID);
    vi.useRealTimers();
  }
});
