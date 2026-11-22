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

const catalogResponse = (available: boolean): Response =>
  jsonResponse({
    models: [
      {
        availability: available ? 'sponsored' : 'unavailable',
        id: 'sponsored-model',
        name: 'Sponsored Model',
        provider: 'openai',
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
  messages: [{ content: 'question', role: 'user' }],
  reasoning: undefined,
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
          return catalogResponse(catalogFetches === 1);
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

  test('refreshes the catalog after a completed prompt', async () => {
    const beforePrompt = await getSupportedModels(USER_ID);
    expect(beforePrompt?.models[0]?.availability).toBe('sponsored');

    await sendPrompt(
      streamOptions,
      '00000000-0000-4000-8000-000000000001',
      async () => {},
    );
    const afterPrompt = await getSupportedModels(USER_ID);

    expect(catalogFetches).toBe(2);
    expect(afterPrompt?.models[0]?.availability).toBe('unavailable');
  });

  test('sends the opaque session header without changing the prompt body', async () => {
    await sendPrompt(
      streamOptions,
      '00000000-0000-4000-8000-000000000007',
      async () => {},
    );

    const promptCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => requestUrl(input).pathname === '/chat/');
    expect(promptCall).toBeDefined();
    const [, init] = promptCall ?? [];
    expect(init?.headers).toMatchObject({
      'x-api-key': 'test-api-key',
      'X-Conversation-Id': '00000000-0000-4000-8000-000000000007',
    });
    const body = init?.body;
    expect(body).toBeTypeOf('string');
    if (typeof body !== 'string') {
      throw new TypeError('Expected the prompt request body to be JSON text');
    }
    expect(JSON.parse(body)).toEqual({
      inference_model: 'sponsored-model',
      interface: 'discord',
      messages: [{ content: 'question', role: 'user' }],
      user_id: USER_ID,
    });
  });

  test('refreshes the catalog after prompt stream consumption fails', async () => {
    const beforePrompt = await getSupportedModels(USER_ID);
    expect(beforePrompt?.models[0]?.availability).toBe('sponsored');

    await expect(
      sendPrompt(
        streamOptions,
        '00000000-0000-4000-8000-000000000001',
        async () => {
          throw new Error('consumer failed');
        },
      ),
    ).rejects.toThrow('consumer failed');
    const afterPrompt = await getSupportedModels(USER_ID);

    expect(catalogFetches).toBe(2);
    expect(afterPrompt?.models[0]?.availability).toBe('unavailable');
  });
});
