import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import { shouldDeferCommand } from '@/core/commands/interactionHandlerUtils.js';
import { execute as chat } from '@/modules/chat/commands/chat/chat.js';
import { SendPromptOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import { ChatApiError } from '@/modules/chat/schemas/Credentials.js';
import {
  forgetConversations,
  getConversationHistory,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { interactionDiscordContext } from '@/modules/chat/utils/discordContext.js';
import {
  forgetFeedbackContexts,
  getFeedbackContext,
  rememberFeedbackContext,
} from '@/modules/chat/utils/feedback.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import {
  deleteChatHistory,
  sendPrompt,
} from '@/modules/chat/utils/requests.js';
import {
  commandErrors,
  commandResponseFunctions,
} from '@/translations/commands.js';

import {
  fakeInteraction,
  jsonResponse,
  requestUrl,
} from './interactionFixture.js';

const USER_ID = '00000000-0000-4000-8000-000000000011';
const DISCORD_ID = 'storage-test-user';

describe('Discord conversation storage', () => {
  test('transforms Discord fields and omits absent context', () => {
    const options = SendPromptOptionsSchema.parse({
      discordContext: { channelId: '2', guildId: '1', messageId: '3' },
      prompt: 'question',
      userId: USER_ID,
    });
    expect(options.discord_context).toEqual({
      channel_id: '2',
      guild_id: '1',
      message_id: '3',
    });
    expect(
      SendPromptOptionsSchema.parse({ prompt: 'question', userId: USER_ID }),
    ).not.toHaveProperty('discord_context');
  });

  test('context-menu commands use the target message, never the interaction ID', () => {
    const { interaction } = fakeInteraction('prompt', '', DISCORD_ID);
    Object.assign(interaction, {
      id: 'interaction',
      targetId: 'message',
      isMessageContextMenuCommand: () => true,
    });
    expect(interactionDiscordContext(interaction).messageId).toBe('message');
  });
});

const originalLoggerSilent = logger.silent;
const requests: Array<{
  method?: string | undefined;
  url: URL;
  headers: Headers;
  body?: unknown;
}> = [];

beforeEach(() => {
  requests.length = 0;
  logger.silent = true;
  clearChatUserCache(DISCORD_ID);
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  vi.stubEnv('API_KEY', 'test-api-key');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input);
      requests.push({
        method: init?.method,
        url,
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      if (url.pathname === '/chat/state/users') {
        return jsonResponse({
          id: USER_ID,
          provider: 'discord',
          provider_subject: DISCORD_ID,
        });
      }
      return jsonResponse({ deleted_conversations: 3, deleted_feedback: 1 });
    }),
  );
});

afterEach(() => {
  logger.silent = originalLoggerSilent;
  forgetConversations(DISCORD_ID);
  forgetConversations('other-user');
  forgetFeedbackContexts(DISCORD_ID);
  forgetFeedbackContexts('other-user');
});

test('authenticates the DELETE and validates returned counts', async () => {
  await expect(deleteChatHistory(USER_ID)).resolves.toEqual({
    deleted_conversations: 3,
    deleted_feedback: 1,
  });
  expect(requests[0]?.url.href).toBe(
    `https://chatbot.invalid/chat/state/users/${USER_ID}/history`,
  );
  expect(requests[0]?.method).toBe('DELETE');
  expect(requests[0]?.headers.get('x-api-key')).toBe('test-api-key');
});

test('real prompt transport sends the stable ID header and Discord context body', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
    expect(new Headers(init?.headers).get('X-Conversation-Id')).toBe(
      'stable-id',
    );
    expect(new Headers(init?.headers).get('x-api-key')).toBe('test-api-key');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      discord_context: { channel_id: 'channel', message_id: 'message' },
    });
    return new Response(
      'event: token\ndata: {"text":"answer"}\n\nevent: done\ndata: {}\n\n',
      { headers: { 'x-response-id': 'response' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  const options = SendPromptOptionsSchema.parse({
    discordContext: { channelId: 'channel', messageId: 'message' },
    prompt: 'question',
    userId: USER_ID,
  });
  await expect(sendPrompt(options, 'stable-id', async () => {})).resolves.toBe(
    'response',
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('forget privately resolves caller identity and clears only their caches', async () => {
  registerConversation(
    ['owned', 'owned-split'],
    [{ content: 'secret', role: 'user' }],
    { userId: DISCORD_ID },
  );
  registerConversation(['other'], [{ content: 'other', role: 'user' }], {
    userId: 'other-user',
  });
  rememberFeedbackContext('owned-response', {
    answer: 'secret',
    userId: DISCORD_ID,
  });
  rememberFeedbackContext('other-response', {
    answer: 'other',
    userId: 'other-user',
  });
  const { interaction, state } = fakeInteraction('chat', 'forget', DISCORD_ID);
  expect(shouldDeferCommand('chat', 'chat forget')).toBe(false);
  await chat(interaction);
  expect(state.calls).toEqual([
    { kind: 'defer', payload: { flags: 64 } },
    {
      kind: 'edit',
      payload: commandResponseFunctions.chatHistoryDeleted(3, 1),
    },
  ]);
  expect(requests.map(({ method, url }) => [method, url.pathname])).toEqual([
    ['POST', '/chat/state/users'],
    ['DELETE', `/chat/state/users/${USER_ID}/history`],
  ]);
  expect(JSON.parse(String(requests[0]?.body))).toMatchObject({
    provider: 'discord',
    provider_subject: DISCORD_ID,
  });
  expect(getConversationHistory('owned')).toBeUndefined();
  expect(getConversationHistory('owned-split')).toBeUndefined();
  expect(getFeedbackContext('owned-response')).toBeUndefined();
  expect(getConversationHistory('other')).toHaveLength(1);
  expect(getFeedbackContext('other-response')?.answer).toBe('other');
});

test.each(['http', 'network', 'invalid-response'])(
  'forget reports %s failure privately without success',
  async (failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        if (requestUrl(input).pathname === '/chat/state/users') {
          return jsonResponse({
            id: USER_ID,
            provider: 'discord',
            provider_subject: DISCORD_ID,
          });
        }
        if (failure === 'network')
          throw new TypeError('PRIVATE_NETWORK_DETAIL');
        return failure === 'http'
          ? Response.json({ detail: 'PRIVATE_DETAIL' }, { status: 500 })
          : jsonResponse({});
      }),
    );
    const { interaction, state } = fakeInteraction(
      'chat',
      'forget',
      DISCORD_ID,
    );
    await chat(interaction);
    expect(state.ephemeral).toBe(true);
    expect(state.calls.at(-1)?.payload).toBe(
      commandErrors.chatHistoryDeleteFailed,
    );
    expect(JSON.stringify(state.calls)).not.toContain('PRIVATE');
  },
);

test('identity failure never requests deletion and keeps the reply private', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({ detail: 'private' }, { status: 503 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const { interaction, state } = fakeInteraction('chat', 'forget', DISCORD_ID);
  await chat(interaction);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(state.ephemeral).toBe(true);
  expect(state.calls.at(-1)?.payload).toMatchObject({
    content: commandErrors.llmUnavailable,
  });
});

test('missing configuration fails safely without a request', async () => {
  vi.stubEnv('CHATBOT_URL', undefined);
  await expect(deleteChatHistory(USER_ID)).rejects.toBeInstanceOf(ChatApiError);
  expect(requests).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});

test('missing authentication never issues a deletion request', async () => {
  vi.stubEnv('API_KEY', undefined);
  await expect(deleteChatHistory(USER_ID)).rejects.toBeInstanceOf(ChatApiError);
  expect(requests).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});
