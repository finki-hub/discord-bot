import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

import { logger } from '@/common/logger/index.js';
import {
  getSupportedModels,
  invalidateModelCatalog,
  sendPrompt,
} from '@/modules/chat/utils/requests.js';

import { jsonResponse, requestUrl } from './interactionFixture.js';

const USER_ID = '00000000-0000-4000-8000-000000000004';

const catalogResponse = (remaining: number): Response =>
  jsonResponse({
    models: [
      {
        availability: remaining === 0 ? 'unavailable' : 'sponsored',
        id: 'sponsored-model',
        name: 'Sponsored Model',
        provider: 'openai',
        sponsored_quota: {
          limit: 1,
          remaining,
          resets_at: '2026-07-21T00:00:00Z',
        },
      },
    ],
    source: 'test',
    version: 1,
  });

const promptResponse = (): Response =>
  new Response('event: done\ndata: {}\n\n', {
    headers: {
      'content-type': 'text/event-stream',
      'x-response-id': 'response-1',
    },
    status: 200,
  });

const streamOptions: SendPromptOptions = {
  embeddings_model: undefined,
  inference_model: 'sponsored-model',
  interface: 'discord',
  max_tokens: undefined,
  messages: [{ content: 'question', role: 'user' }],
  reasoning: undefined,
  temperature: undefined,
  top_p: undefined,
  user_id: USER_ID,
};

describe('prompt catalog cache', () => {
  const originalLoggerSilent = logger.silent;
  let catalogFetches: number;

  beforeEach(() => {
    catalogFetches = 0;
    logger.silent = true;
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
    vi.stubEnv('API_KEY', 'test-api-key');
    invalidateModelCatalog(USER_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = requestUrl(input);
        if (url.pathname === '/chat/models') {
          catalogFetches++;
          return catalogResponse(catalogFetches === 1 ? 1 : 0);
        }
        if (url.pathname === '/chat/') {
          return promptResponse();
        }
        throw new Error(`Unexpected request URL: ${url.href}`);
      }),
    );
  });

  afterEach(() => {
    invalidateModelCatalog(USER_ID);
    logger.silent = originalLoggerSilent;
  });

  test('refreshes sponsored quota after a completed prompt', async () => {
    const beforePrompt = await getSupportedModels(USER_ID);
    expect(beforePrompt?.models[0]?.sponsored_quota?.remaining).toBe(1);

    await sendPrompt(streamOptions, async () => {});
    const afterPrompt = await getSupportedModels(USER_ID);

    expect(catalogFetches).toBe(2);
    expect(afterPrompt?.models[0]?.availability).toBe('unavailable');
    expect(afterPrompt?.models[0]?.sponsored_quota?.remaining).toBe(0);
  });

  test('refreshes sponsored quota after prompt stream consumption fails', async () => {
    const beforePrompt = await getSupportedModels(USER_ID);
    expect(beforePrompt?.models[0]?.sponsored_quota?.remaining).toBe(1);

    await expect(
      sendPrompt(streamOptions, async () => {
        throw new Error('consumer failed');
      }),
    ).rejects.toThrow('consumer failed');
    const afterPrompt = await getSupportedModels(USER_ID);

    expect(catalogFetches).toBe(2);
    expect(afterPrompt?.models[0]?.availability).toBe('unavailable');
    expect(afterPrompt?.models[0]?.sponsored_quota?.remaining).toBe(0);
  });
});
