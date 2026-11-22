import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import { execute as executeChat } from '@/modules/chat/commands/chat/chat.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import { invalidateModelCatalog } from '@/modules/chat/utils/requests.js';

import {
  callsOf,
  fakeInteraction,
  jsonResponse,
  payloadFlags,
  requestUrl,
} from './interactionFixture.js';

const USER_ID = '00000000-0000-4000-8000-000000000014';

const catalog = {
  models: [
    {
      availability: 'sponsored',
      id: 'free-model',
      name: 'Free Model',
      provider: 'openai',
      sponsored_quota: {
        limit: 5,
        remaining: 4,
        resets_at: '2026-07-19T00:00:00Z',
      },
    },
    {
      availability: 'byok',
      id: 'byok-model',
      name: 'BYOK Model',
      provider: 'openai',
    },
    {
      availability: 'unavailable',
      id: 'offline-model',
      name: 'Offline Model',
      provider: 'openai',
    },
  ],
  source: 'test',
  version: 1,
};

describe('chat models command', () => {
  const originalLoggerSilent = logger.silent;

  beforeEach(() => {
    logger.silent = true;
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
    vi.stubEnv('API_KEY', 'test-api-key');
    clearChatUserCache(USER_ID);
    invalidateModelCatalog(USER_ID);
  });

  afterEach(() => {
    clearChatUserCache(USER_ID);
    invalidateModelCatalog(USER_ID);
    logger.silent = originalLoggerSilent;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('lists only free models', async () => {
    const driver = fakeInteraction('chat', 'models', USER_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = requestUrl(input);
        if (url.pathname === '/chat/state/users') {
          return jsonResponse({
            id: USER_ID,
            provider: 'discord',
            provider_subject: 'discord-user',
          });
        }
        if (url.pathname === '/chat/models') {
          return jsonResponse(catalog);
        }
        throw new Error(`Unexpected URL: ${url.href}`);
      }),
    );

    await executeChat(driver.interaction);

    const payloads = callsOf(driver.state, 'edit').map(
      (call) => call.payload as { content?: string },
    );
    const content = payloads.map((payload) => payload.content ?? '').join('');

    expect(content).toContain('free-model');
    expect(content).not.toContain('byok-model');
    expect(content).not.toContain('offline-model');
    expect(payloadFlags(callsOf(driver.state, 'defer')[0]?.payload)).toBe(
      MessageFlags.Ephemeral,
    );
  });
});
