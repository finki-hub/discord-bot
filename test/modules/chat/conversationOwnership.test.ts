import { ChannelType, type Message } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type * as MessageUtils from '@/common/utils/messages.js';
import type * as Feedback from '@/modules/chat/utils/feedback.js';
import type * as Requests from '@/modules/chat/utils/requests.js';

import { execute as ask } from '@/modules/chat/commands/chat/ask.js';
import { execute as chat } from '@/modules/chat/commands/chat/chat.js';
import { forgetConversations } from '@/modules/chat/utils/conversation.js';
import { forgetFeedbackContexts } from '@/modules/chat/utils/feedback.js';
import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import { handleChatThread } from '@/modules/chat/utils/thread.js';

import { fakeInteraction, requestUrl } from './interactionFixture.js';

const A = 'account-a-discord';
const B = 'account-b-discord';
const ACCOUNT_A = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '00000000-0000-4000-8000-000000000002';
const UUID_PATTERN = /^[0-9a-f-]{36}$/u;
const state = vi.hoisted(() => ({ message: 0, thread: false }));
const exchanges = new Map<string, { userId: string; prompts: string[] }>();
const sent: Array<{
  id: string;
  userId: string;
  messages: Array<{ role: string; content: string }>;
}> = [];

vi.mock('@/common/logger/index.js', () => ({
  logger: {
    error: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
  },
}));
vi.mock('@/common/services/analytics.js', () => ({
  captureException: vi.fn<() => void>(),
  trackCommandInvoked: vi.fn<() => void>(),
  trackMessageAnswered: vi.fn<() => void>(),
}));
vi.mock('@/common/utils/messages.js', async (original) => ({
  ...(await original<typeof MessageUtils>()),
  safeStreamReplyToInteraction: stream,
  safeStreamReplyToMessage: stream,
}));
vi.mock('@/modules/chat/utils/feedback.js', async (original) => ({
  ...(await original<typeof Feedback>()),
  attachFeedbackButtons: async () => {},
}));
vi.mock('@/modules/chat/utils/requests.js', async (original) => ({
  ...(await original<typeof Requests>()),
  getValidatedInferenceModel: async () => 'model',
}));
vi.mock('@/modules/chat/utils/identity.js', () => ({
  resolveChatUser: async (user: { id: string }) => ({
    id:
      user.id === 'account-a-discord'
        ? '00000000-0000-4000-8000-000000000001'
        : '00000000-0000-4000-8000-000000000002',
    provider: 'discord',
    provider_subject: user.id,
  }),
}));

// eslint-disable-next-line func-style -- vi.mock factories need a hoisted declaration.
async function stream(
  _target: unknown,
  produce: (emit: (event: unknown) => Promise<void>) => Promise<void>,
) {
  await produce(async () => {});
  state.message += 1;
  return [
    {
      id: `owned-answer-${state.message}`,
      fetch: async () => ({ content: 'server answer', edit: async () => {} }),
    },
  ] as unknown as Message[];
}

const followUp = (key: string, userId: string, content: string): Message =>
  ({
    author: { id: userId, bot: false },
    channelId: state.thread ? key : 'shared-channel',
    guildId: 'shared-guild',
    guild: null,
    content,
    id: `question-${content}`,
    reference: state.thread ? null : { messageId: key },
    channel: { isThread: () => state.thread, isSendable: () => false },
  }) as unknown as Message;

beforeEach(() => {
  state.message = 0;
  sent.length = 0;
  exchanges.clear();
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  vi.stubEnv('API_KEY', 'test-api-key');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = requestUrl(input).pathname;
      if (init?.method === 'DELETE') {
        let count = 0;
        for (const [storedId, stored] of exchanges) {
          if (path.includes(stored.userId)) {
            exchanges.delete(storedId);
            count += 1;
          }
        }
        return Response.json({
          deleted_conversations: count,
          deleted_feedback: 0,
        });
      }
      if (path !== '/chat/') throw new Error('Unexpected test request');
      const payload = JSON.parse(init?.body as string) as {
        user_id: string;
        messages: Array<{ role: string; content: string }>;
      };
      const id = new Headers(init?.headers).get('X-Conversation-Id');
      if (id === null) throw new Error('Missing conversation ID');
      const existing = exchanges.get(id);
      if (existing !== undefined && existing.userId !== payload.user_id) {
        return Response.json(
          { detail: 'Conversation ownership mismatch' },
          { status: 409 },
        );
      }
      const exchange = exchanges.getOrInsertComputed(id, () => ({
        userId: payload.user_id,
        prompts: [],
      }));
      exchange.prompts.push(payload.messages.at(-1)?.content ?? '');
      sent.push({ id, userId: payload.user_id, messages: payload.messages });
      return new Response(
        'event: token\ndata: {"text":"server answer"}\n\nevent: done\ndata: {}\n\n',
        { headers: { 'x-response-id': randomUUID() } },
      );
    }),
  );
});

afterEach(() => {
  forgetConversations(A);
  forgetConversations(B);
  forgetFeedbackContexts(A);
  forgetFeedbackContexts(B);
});

test.each([false, true])(
  'shared thread=%s partitions actual wire IDs by internal account and preserves B after A forgets',
  async (thread) => {
    state.thread = thread;
    const threadId = `thread-${randomUUID()}`;
    if (thread) {
      const create = fakeInteraction('chat', 'thread', A);
      const channel = {
        type: ChannelType.GuildText,
        threads: {
          create: async () => ({
            id: threadId,
            members: { add: async () => {} },
            send: async () => {},
          }),
        },
      };
      Object.assign(create.interaction, {
        channel,
        guild: { id: randomUUID() },
      });
      await handleChatThread(create.interaction);
      await handleChatMessage(followUp(threadId, A, 'A initial'));
    } else {
      const create = fakeInteraction('ask', '', A);
      Object.assign(create.interaction, {
        channelId: 'shared-channel',
        isMessageContextMenuCommand: () => false,
        options: {
          getString: (name: string) => (name === 'prompt' ? 'A initial' : null),
          getNumber: () => null,
        },
      });
      await ask(create.interaction);
    }
    await handleChatMessage(
      followUp(thread ? threadId : 'owned-answer-1', B, 'B first'),
    );
    await handleChatMessage(
      followUp(thread ? threadId : 'owned-answer-2', B, 'B second'),
    );
    await handleChatMessage(
      followUp(thread ? threadId : 'owned-answer-3', A, 'A followup'),
    );
    expect(sent).toHaveLength(4);
    const aId = sent[0]?.id ?? '';
    const bId = sent[1]?.id ?? '';
    expect(aId).toMatch(UUID_PATTERN);
    expect(bId).toMatch(UUID_PATTERN);
    expect(bId).not.toBe(aId);
    expect(sent.map(({ userId }) => userId)).toEqual([
      ACCOUNT_A,
      ACCOUNT_B,
      ACCOUNT_B,
      ACCOUNT_A,
    ]);
    expect(sent.map(({ id }) => id)).toEqual([aId, bId, bId, aId]);
    expect(sent[1]?.messages[0]?.content).toBe('A initial');
    expect(exchanges.get(aId)?.prompts).toEqual(['A initial', 'A followup']);
    expect(exchanges.get(bId)?.prompts).toEqual(['B first', 'B second']);

    await chat(fakeInteraction('chat', 'forget', A).interaction);
    expect(exchanges.has(aId)).toBe(false);
    expect(exchanges.get(bId)?.prompts).toEqual(['B first', 'B second']);
    await handleChatMessage(
      followUp(thread ? threadId : 'owned-answer-4', B, 'B after forget'),
    );
    expect(sent[4]?.id).toBe(bId);
    expect(sent[4]?.messages).toEqual([
      { role: 'user', content: 'B after forget' },
    ]);
    await handleChatMessage(
      followUp(thread ? threadId : 'owned-answer-5', A, 'A new start'),
    );
    expect(sent[5]?.userId).toBe(ACCOUNT_A);
    expect(sent[5]?.id).not.toBe(aId);
    expect(sent[5]?.id).not.toBe(bId);
    expect(JSON.stringify(sent[5]?.messages)).not.toContain('A initial');
    expect(exchanges.get(bId)?.prompts).toEqual([
      'B first',
      'B second',
      'B after forget',
    ]);
  },
);
