import type { ChatInputCommandInteraction, Message } from 'discord.js';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamEvent } from '@/common/types/StreamEvent.js';
import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

import { logger } from '@/common/logger/index.js';
import {
  getConversationHistory,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import {
  invalidateModelCatalog,
  sendPrompt,
} from '@/modules/chat/utils/requests.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';
import {
  commandErrorFunctions,
  commandErrors,
} from '@/translations/commands.js';

const RAW_MESSAGE = 'provider-secret global_limit=100';
const RESET_AT = '2026-07-19T00:00:00Z';
const INVALID_RESET_AT = 'not-a-date';
const USER_ID = '00000000-0000-4000-8000-000000000001';

const errorCases = [
  {
    code: 'free_quota_exhausted',
    expectedMessage: () => commandErrorFunctions.freeQuotaExhausted(RESET_AT),
    hasUtc: true,
    resets_at: RESET_AT,
  },
  {
    code: 'free_quota_exhausted',
    expectedMessage: () =>
      commandErrorFunctions.freeQuotaExhausted(INVALID_RESET_AT),
    hasUtc: false,
    resets_at: INVALID_RESET_AT,
  },
  {
    code: 'free_tier_unavailable',
    expectedMessage: () => commandErrors.freeTierUnavailable,
    hasUtc: false,
  },
  {
    code: 'sponsored_request_in_progress',
    expectedMessage: () => commandErrors.sponsoredRequestInProgress,
    hasUtc: false,
  },
] as const;

const sseResponse = (payload: Record<string, string>): Response => {
  const body = `event: error\ndata: ${JSON.stringify(payload)}\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'x-response-id': 'response-1',
    },
    status: 200,
  });
};

const userResponse = (): Response =>
  Response.json({
    id: USER_ID,
    provider: 'discord',
    provider_subject: 'discord-user-1',
  });

const modelCatalogResponse = (): Response =>
  Response.json({ models: [], source: 'test', version: 1 });

const installFetchQueue = (responses: Response[]): void => {
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

const streamOptions = {
  embeddings_model: undefined,
  inference_model: undefined,
  interface: 'discord',
  max_tokens: undefined,
  messages: [{ content: 'question', role: 'user' as const }],
  reasoning: undefined,
  temperature: undefined,
  top_p: undefined,
  user_id: USER_ID,
} satisfies SendPromptOptions;

const readContent = (value: unknown): string => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('content' in value) ||
    typeof value.content !== 'string'
  ) {
    throw new TypeError('Expected a response with string content');
  }
  return value.content;
};

const fakeInteraction = () => {
  const state = { replied: false, responses: [] as unknown[] };
  const interaction = {
    channelId: 'channel-1',
    deferred: false,
    editReply: async (payload: unknown) => {
      state.responses.push(payload);
    },
    fetchReply: async () => ({ id: 'interaction-response-1' }),
    guild: null,
    replied: state.replied,
    reply: async (payload: unknown) => {
      state.replied = true;
      interaction.replied = true;
      state.responses.push(payload);
    },
    user: { id: 'discord-user-1' },
  } as unknown as ChatInputCommandInteraction;

  return { interaction, state };
};

const fakeMessage = () => {
  const state = { responses: [] as unknown[] };
  const message = {
    author: {
      avatarURL: () => null,
      bot: false,
      displayName: 'Test User',
      id: 'discord-user-1',
    },
    channel: {
      isSendable: () => true,
      isThread: () => false,
      sendTyping: async () => {},
    },
    channelId: 'channel-1',
    content: 'question',
    guild: null,
    reference: { messageId: 'history-root' },
    reply: async (payload: unknown) => {
      state.responses.push(payload);
      return { edit: async () => {}, id: 'message-response-1' };
    },
  } as unknown as Message;

  return { message, state };
};

const readSseEvent = async (payload: Record<string, string>) => {
  installFetchQueue([sseResponse(payload)]);
  const events: StreamEvent[] = [];
  await sendPrompt(streamOptions, async (event) => {
    events.push(event);
  });
  expect(events).toHaveLength(1);
  return events[0];
};

describe('sponsored stream errors', () => {
  const originalLoggerSilent = logger.silent;

  beforeEach(() => {
    logger.silent = true;
    vi.stubGlobal('Temporal', {
      Instant: {
        from: (value: string) => {
          if (value !== RESET_AT) {
            throw new Error('invalid test instant');
          }
          return { toLocaleString: () => '19.7.2026, 00:00' };
        },
      },
      Now: { instant: () => ({ toString: () => '2026-07-18 00:00:00Z' }) },
    });
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.example');
    vi.stubEnv('API_KEY', 'test-key');
    invalidateModelCatalog(USER_ID);
    clearChatUserCache('discord-user-1');
  });

  afterEach(() => {
    invalidateModelCatalog(USER_ID);
    clearChatUserCache('discord-user-1');
    logger.silent = originalLoggerSilent;
  });

  test.each(errorCases)(
    'localizes $code without exposing provider details for reset $resets_at',
    async (testCase) => {
      const payload: Record<string, string> = {
        code: testCase.code,
        message: RAW_MESSAGE,
      };
      if ('resets_at' in testCase) {
        payload['resets_at'] = testCase.resets_at;
      }
      const event = await readSseEvent(payload);
      expect(event?.type).toBe('error');
      if (event?.type !== 'error') {
        throw new Error('Expected an error event');
      }
      expect(event.code).toBe(testCase.code);
      expect(event.resets_at).toBe(
        'resets_at' in testCase ? testCase.resets_at : undefined,
      );

      const interactionDriver = fakeInteraction();
      installFetchQueue([sseResponse(payload)]);
      await handlePromptWithStreaming(
        interactionDriver.interaction,
        streamOptions,
        `test interaction ${testCase.code}`,
      );
      const interactionContent = readContent(
        interactionDriver.state.responses[0],
      );
      expect(interactionContent).toBe(testCase.expectedMessage());
      expect(interactionContent).not.toContain(RAW_MESSAGE);
      expect(interactionContent.includes('UTC')).toBe(testCase.hasUtc);

      registerConversation(['history-root'], []);
      const messageDriver = fakeMessage();
      installFetchQueue([
        userResponse(),
        modelCatalogResponse(),
        sseResponse(payload),
      ]);
      await handleChatMessage(messageDriver.message);
      const messageContent = readContent(messageDriver.state.responses[0]);
      expect(messageContent).toBe(commandErrors.unknownChatError);
      expect(messageContent).not.toBe(interactionContent);
      expect(messageContent).not.toContain(RAW_MESSAGE);
      expect(getConversationHistory('message-response-1')).toBeUndefined();
      expect(getConversationHistory('interaction-response-1')).toBeUndefined();
    },
  );
});
