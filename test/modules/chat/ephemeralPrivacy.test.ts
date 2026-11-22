import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

import { logger } from '@/common/logger/index.js';
import { safeStreamReplyToInteraction } from '@/common/utils/messages.js';
import { execute as executeChat } from '@/modules/chat/commands/chat/chat.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import { invalidateModelCatalog } from '@/modules/chat/utils/requests.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';

import {
  callsOf,
  fakeInteraction,
  jsonResponse,
  payloadFlags,
  requestUrl,
} from './interactionFixture.js';

const MODEL_USER_ID = '00000000-0000-4000-8000-000000000003';

const streamErrorResponse = (): Response =>
  new Response(
    'event: error\ndata: {"code":"free_tier_unavailable","message":"provider secret"}\n\n',
    { headers: { 'Content-Type': 'text/event-stream' }, status: 200 },
  );

const unavailableResponse = (): Response =>
  new Response('not ready', { status: 503 });

const expectEphemeral = (calls: ReturnType<typeof callsOf>): void => {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(payloadFlags(call.payload)).toBe(MessageFlags.Ephemeral);
  }
};

const modelPayload = () => ({
  models: Array.from({ length: 25 }, (_, index) => ({
    availability: 'sponsored',
    id: `model-${index}-${'x'.repeat(50)}`,
    name: `Model ${index} ${'x'.repeat(80)}`,
    provider: 'openai',
    ...(index === 0 && {
      sponsored_quota: {
        limit: 5,
        remaining: 4,
        resets_at: '2026-07-19T00:00:00Z',
      },
    }),
  })),
  source: 'test',
  version: 1,
});

const streamOptions: SendPromptOptions = {
  embeddings_model: undefined,
  inference_model: undefined,
  interface: 'discord',
  max_tokens: undefined,
  messages: [{ content: 'question', role: 'user' }],
  reasoning: undefined,
  temperature: undefined,
  top_p: undefined,
  user_id: MODEL_USER_ID,
};

describe('ephemeral chat output', () => {
  const originalLoggerSilent = logger.silent;

  beforeEach(() => {
    logger.silent = true;
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
    vi.stubEnv('API_KEY', 'test-api-key');
    clearChatUserCache(MODEL_USER_ID);
    invalidateModelCatalog(MODEL_USER_ID);
  });

  afterEach(() => {
    clearChatUserCache(MODEL_USER_ID);
    invalidateModelCatalog(MODEL_USER_ID);
    logger.silent = originalLoggerSilent;
  });

  test('resolves identity before returning an ephemeral model catalog', async () => {
    const driver = fakeInteraction('chat', 'models', MODEL_USER_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = requestUrl(input);
        if (url.pathname === '/chat/state/users') {
          driver.state.requestOrder.push('identity');
          return jsonResponse({
            id: MODEL_USER_ID,
            provider: 'discord',
            provider_subject: 'privacy-test',
          });
        }
        if (url.pathname === '/chat/models') {
          driver.state.requestOrder.push('catalog');
          return jsonResponse(modelPayload());
        }
        throw new Error(`Unexpected model request URL: ${url.href}`);
      }),
    );

    await executeChat(driver.interaction);

    expect(driver.state.requestOrder).toEqual(['defer', 'identity', 'catalog']);
    expect(payloadFlags(driver.state.calls[0]?.payload)).toBe(
      MessageFlags.Ephemeral,
    );
    expect(callsOf(driver.state, 'edit')).toHaveLength(1);
    expectEphemeral(callsOf(driver.state, 'followUp'));
  });

  test('keeps sponsored streaming errors in ephemeral follow-ups', async () => {
    const driver = fakeInteraction('ask', 'query', MODEL_USER_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamErrorResponse()),
    );
    await driver.interaction.deferReply();

    await handlePromptWithStreaming(
      driver.interaction,
      streamOptions,
      'ephemeral stream guidance',
    );

    expect(callsOf(driver.state, 'reply')).toHaveLength(0);
    expect(callsOf(driver.state, 'delete')).toHaveLength(1);
    expect(callsOf(driver.state, 'edit')).toHaveLength(0);
    expectEphemeral(callsOf(driver.state, 'followUp'));
  });

  test('streams long private answers into ephemeral follow-ups', async () => {
    const driver = fakeInteraction('ask', '', MODEL_USER_ID);
    await driver.interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const editMessage = vi.fn<
      (
        message: unknown,
        payload: { content?: string },
      ) => Promise<{
        content: string;
        id: string;
      }>
    >(async (_message, payload) => ({
      content: payload.content ?? '',
      id: 'webhook-edit',
    }));
    Object.assign(driver.interaction, {
      webhook: {
        deleteMessage: vi.fn<() => Promise<void>>(async () => {}),
        editMessage,
      },
    });

    await safeStreamReplyToInteraction(driver.interaction, async (emit) => {
      await emit({ text: 'a'.repeat(2_100), type: 'token' });
      // Force an edit while streaming so the follow-up itself is refreshed.
      await emit({ code: 'interrupted', message: 'partial', type: 'error' });
    });

    const followUp = callsOf(driver.state, 'followUp')[0];
    expect(payloadFlags(followUp?.payload)).toBe(
      // eslint-disable-next-line no-bitwise -- combining distinct message flags
      MessageFlags.SuppressEmbeds | MessageFlags.Ephemeral,
    );
    expect(callsOf(driver.state, 'reply')).toHaveLength(0);
    expect(editMessage).toHaveBeenCalledOnce();
  });

  test('settles a public deferral before a private transport error', async () => {
    const driver = fakeInteraction('ask', 'query', MODEL_USER_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => unavailableResponse()),
    );
    await driver.interaction.deferReply();

    await handlePromptWithStreaming(
      driver.interaction,
      streamOptions,
      'private transport error',
    );

    expect(callsOf(driver.state, 'delete')).toHaveLength(1);
    expect(callsOf(driver.state, 'edit')).toHaveLength(0);
    expectEphemeral(callsOf(driver.state, 'followUp'));
  });
});
