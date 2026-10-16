import type { Message } from 'discord.js';

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamEvent } from '@/common/types/StreamEvent.js';
import type * as MessageUtils from '@/common/utils/messages.js';
import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';
import type * as Requests from '@/modules/chat/utils/requests.js';

import { execute as ask } from '@/modules/chat/commands/chat/ask.js';
import {
  forgetConversations,
  getConversationHistory,
  getConversationId,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { forgetChatUser } from '@/modules/chat/utils/privacy.js';
import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';
import { commandResponses } from '@/translations/commands.js';

import { fakeInteraction } from './interactionFixture.js';

const USER_ID = '00000000-0000-4000-8000-000000000099';
const UUID_PATTERN = /^[0-9a-f-]{36}$/iu;

const mocks = vi.hoisted(() => ({
  nextMessage: 0,
  answer: 'answer',
  content: 'answer',
  edit: vi.fn<(value: { content: string }) => Promise<void>>(async () => {}),
  attachFeedbackButtons: vi.fn<() => Promise<void>>(async () => {}),
  rememberFeedbackContext: vi.fn<() => void>(),
  sendPrompt:
    vi.fn<
      (
        options: SendPromptOptions,
        conversationId: string,
        onEvent: (event: StreamEvent) => Promise<void>,
      ) => Promise<string>
    >(),
}));

vi.mock('@/common/logger/index.js', () => ({
  logger: { error: vi.fn<() => void>(), warn: vi.fn<() => void>() },
}));
vi.mock('@/common/services/analytics.js', () => ({
  captureException: vi.fn<() => void>(),
  trackCommandInvoked: vi.fn<() => void>(),
  trackMessageAnswered: vi.fn<() => void>(),
}));
vi.mock('@/common/utils/messages.js', async (original) => {
  const actual = await original<typeof MessageUtils>();
  return {
    ...actual,
    safeStreamReplyToInteraction: streamReply,
    safeStreamReplyToMessage: streamReply,
  };
});

// eslint-disable-next-line func-style -- vi.mock factories need a hoisted declaration.
async function streamReply(
  _target: unknown,
  produce: (emit: (event: StreamEvent) => Promise<void>) => Promise<void>,
) {
  await produce(async () => {});
  mocks.nextMessage += 1;
  return [
    {
      id: `answer-${mocks.nextMessage}`,
      fetch: async () => ({ content: mocks.content, edit: mocks.edit }),
    },
  ] as unknown as Message[];
}
vi.mock('@/modules/chat/utils/feedback.js', () => ({
  attachFeedbackButtons: mocks.attachFeedbackButtons,
  rememberFeedbackContext: mocks.rememberFeedbackContext,
}));
vi.mock('@/modules/chat/utils/identity.js', () => ({
  resolveChatUser: async () => ({
    id: '00000000-0000-4000-8000-000000000099',
    provider: 'discord',
    provider_subject: 'discord-user',
  }),
}));
vi.mock('@/modules/chat/utils/requests.js', async (original) => ({
  ...(await original<typeof Requests>()),
  getValidatedInferenceModel: async () => 'model',
  sendPrompt: mocks.sendPrompt,
}));

const driver = () => {
  const result = fakeInteraction('ask', '', 'discord-user');
  Object.assign(result.interaction, {
    channelId: 'ask-channel',
    id: 'interaction-not-a-message',
    isMessageContextMenuCommand: () => false,
    options: {
      getString: (name: string) => (name === 'prompt' ? 'question' : null),
      getNumber: () => null,
    },
  });
  return result;
};

const followUpMessage = (
  reference: string,
  content: string,
  thread = false,
): Message =>
  ({
    author: { bot: false, id: 'discord-user' },
    channel: {
      isSendable: () => true,
      isThread: () => thread,
      sendTyping: async () => {},
    },
    channelId: thread ? reference : 'reply-channel',
    content,
    guild: null,
    guildId: 'reply-guild',
    id: `question-${content}`,
    reference: thread ? null : { messageId: reference },
  }) as unknown as Message;

describe('conversation session lifecycle', () => {
  beforeEach(() => {
    forgetConversations('discord-user');
    mocks.nextMessage = 0;
    mocks.answer = 'answer';
    mocks.content = 'answer';
    mocks.sendPrompt.mockImplementation(async (_options, _id, onEvent) => {
      await onEvent({ text: mocks.answer, type: 'token' });
      return 'response-id';
    });
  });

  test('actual asks send context, use distinct IDs and register the sent IDs', async () => {
    await ask(driver().interaction);
    await ask(driver().interaction);
    const first = mocks.sendPrompt.mock.calls[0];
    const second = mocks.sendPrompt.mock.calls[1];
    expect(first?.[1]).toMatch(UUID_PATTERN);
    expect(second?.[1]).toMatch(UUID_PATTERN);
    expect(second?.[1]).not.toBe(first?.[1]);
    expect(first?.[0].discord_context).toEqual({
      channel_id: 'ask-channel',
      guild_id: undefined,
      message_id: undefined,
    });
    expect(getConversationId('answer-1')).toBe(first?.[1]);
    expect(getConversationId('answer-2')).toBe(second?.[1]);
    expect(mocks.edit.mock.calls[0]?.[0].content).toContain(
      commandResponses.chatStorageNotice,
    );
  });

  test.each([false, true])(
    'reply/thread=%s reuses its ID and forwards growing history and context',
    async (thread) => {
      const root = randomUUID();
      const id = randomUUID();
      registerConversation(
        [root],
        [{ content: 'starting question', role: 'user' }],
        { accountId: USER_ID, conversationId: id, userId: 'discord-user' },
      );
      await handleChatMessage(followUpMessage(root, 'first', thread));
      await handleChatMessage(
        followUpMessage(thread ? root : 'answer-1', 'second', thread),
      );
      const calls = mocks.sendPrompt.mock.calls;
      expect(calls.map((call) => call[1])).toEqual([id, id]);
      expect(calls[0]?.[0].messages).toHaveLength(2);
      expect(calls[1]?.[0].messages).toHaveLength(4);
      expect(calls[0]?.[0].discord_context).toEqual({
        channel_id: thread ? root : 'reply-channel',
        guild_id: 'reply-guild',
        message_id: 'question-first',
      });
      expect(getConversationHistory(thread ? root : 'answer-2')).toHaveLength(
        5,
      );
    },
  );

  test('long answers fall back to one private storage notice without truncation', async () => {
    mocks.content = 'a'.repeat(2_000);
    const { interaction, state } = driver();
    await ask(interaction);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(state.calls).toEqual([
      {
        kind: 'followUp',
        payload: {
          content: commandResponses.chatStorageNotice,
          flags: 64,
        },
      },
    ]);
  });

  test('stream errors also receive the notice', async () => {
    mocks.sendPrompt.mockRejectedValueOnce(new Error('stream interrupted'));
    const { interaction, state } = driver();
    await ask(interaction);
    expect(state.calls.at(-1)).toEqual({
      kind: 'followUp',
      payload: {
        content: commandResponses.chatStorageNotice,
        flags: 64,
      },
    });
    expect(getConversationId('answer-1')).toBeUndefined();
  });

  test('requests that never reached the API get no notice', async () => {
    mocks.sendPrompt.mockRejectedValueOnce(new Error('LLM_UNAVAILABLE'));
    const { interaction, state } = driver();
    await ask(interaction);
    expect(
      state.calls.some(
        ({ payload }) =>
          (payload as undefined | { content?: string })?.content ===
          commandResponses.chatStorageNotice,
      ),
    ).toBe(false);
  });

  test('a failed footnote edit falls back to the notice', async () => {
    mocks.edit.mockRejectedValueOnce(new Error('message edit failed'));
    const { interaction, state } = driver();
    await ask(interaction);
    expect(state.calls.at(-1)?.payload).toEqual({
      content: commandResponses.chatStorageNotice,
      flags: 64,
    });
  });

  test.each(['ask', 'thread'])(
    'forget drains active %s streams, rejects intervening work and removes late finalization',
    async (mode) => {
      const started = Promise.withResolvers<undefined>();
      const release = Promise.withResolvers<undefined>();
      mocks.sendPrompt.mockImplementationOnce(async (_options, _id, emit) => {
        started.resolve(undefined);
        await release.promise;
        await emit({ text: 'old secret', type: 'token' });
        return 'late-response';
      });
      const thread = randomUUID();
      registerConversation([thread], [], { userId: 'discord-user' });
      const active =
        mode === 'ask'
          ? ask(driver().interaction)
          : handleChatMessage(
              followUpMessage(thread, 'active thread question', true),
            );
      await started.promise;
      const remove = vi.fn<() => Promise<void>>(async () => {});
      const deletion = forgetChatUser(
        'discord-user',
        () => forgetConversations('discord-user'),
        remove,
      );
      await ask(driver().interaction);
      expect(mocks.sendPrompt).toHaveBeenCalledOnce();
      expect(remove).not.toHaveBeenCalled();
      release.resolve(undefined);
      await Promise.all([active, deletion]);
      expect(remove).toHaveBeenCalledOnce();
      expect(getConversationHistory('answer-1')).toBeUndefined();
      expect(getConversationHistory(thread)).toBeUndefined();
      await handleChatMessage(followUpMessage('answer-1', 'after forget'));
      await handleChatMessage(followUpMessage(thread, 'after forget', true));
      expect(mocks.sendPrompt).toHaveBeenCalledOnce();
      await ask(driver().interaction);
      expect(mocks.sendPrompt).toHaveBeenCalledTimes(2);
    },
  );

  test('missing/empty streamed answers still receive the notice', async () => {
    mocks.answer = '';
    const { interaction, state } = driver();
    const options = {
      messages: [],
      user_id: USER_ID,
    } as unknown as SendPromptOptions;
    await handlePromptWithStreaming(interaction, options, 'ask');
    expect(state.calls.at(-1)?.payload).toMatchObject({
      content: commandResponses.chatStorageNotice,
    });
  });
});
