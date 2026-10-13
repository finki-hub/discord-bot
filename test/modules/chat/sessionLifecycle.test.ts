import type { Message } from 'discord.js';
import type { Logger } from 'winston';

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamEvent } from '@/common/types/StreamEvent.js';
import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

import {
  getConversationHistory,
  getConversationSessionId,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const mocks = vi.hoisted(() => {
  let responseIndex = 0;
  const sent: Array<{ options: SendPromptOptions; sessionId: string }> = [];
  return {
    applyStreamEvent: (state: { answer: string }, event: StreamEvent): void => {
      if (event.type === 'token') {
        state.answer += event.text;
      }
    },
    attachFeedbackButtons: vi.fn<() => Promise<void>>(async () => {}),
    getValidatedInferenceModel: vi.fn<
      (userId: string, configuredModel: string | undefined) => Promise<string>
    >(async () => 'model'),
    hasSavableAnswer: (state: { answer: string }): boolean =>
      state.answer.length > 0,
    rememberFeedbackContext: vi.fn<() => void>(),
    resolveChatUser: vi.fn<
      () => Promise<{
        id: string;
        provider: 'discord';
        provider_subject: string;
      }>
    >(async () => ({
      id: '00000000-0000-4000-8000-000000000099',
      provider: 'discord' as const,
      provider_subject: 'discord-user',
    })),
    sent,
    sendPrompt: vi.fn<
      (
        options: SendPromptOptions,
        sessionId: string,
        onEvent: (event: StreamEvent) => Promise<void>,
      ) => Promise<string>
    >(
      async (
        options: SendPromptOptions,
        sessionId: string,
        onEvent: (event: StreamEvent) => Promise<void>,
      ) => {
        responseIndex += 1;
        sent.push({ options, sessionId });
        await onEvent({ text: `answer-${responseIndex}`, type: 'token' });
        return `response-${responseIndex}`;
      },
    ),
    nextMessageId: (): string => {
      responseIndex += 1;
      return `stream-message-${responseIndex}`;
    },
    reset: (): void => {
      responseIndex = 0;
      sent.length = 0;
    },
  };
});

vi.mock(import('@/common/logger/index.js'), () => ({
  logger: {
    error: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
  } as unknown as Logger,
}));
vi.mock(import('@/common/services/analytics.js'), () => ({
  captureException: vi.fn<(...args: unknown[]) => void>(),
  trackCommandInvoked: vi.fn<(...args: unknown[]) => void>(),
  trackMessageAnswered: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock(import('@/common/utils/messages.js'), () => ({
  safeEphemeralReplyToInteraction: vi.fn<() => Promise<void>>(async () => {}),
  safeStreamReplyToInteraction: async (
    _interaction: unknown,
    stream: (emit: (event: StreamEvent) => Promise<void>) => Promise<void>,
  ) => {
    await stream(async () => {});
    return [{ id: mocks.nextMessageId() }] as unknown as Message[];
  },
  safeStreamReplyToMessage: async (
    _message: Message,
    stream: (emit: (event: StreamEvent) => Promise<void>) => Promise<void>,
  ) => {
    await stream(async () => {});
    return [{ id: mocks.nextMessageId() }] as unknown as Message[];
  },
}));
vi.mock(import('@/modules/chat/utils/feedback.js'), () => ({
  attachFeedbackButtons: mocks.attachFeedbackButtons,
  rememberFeedbackContext: mocks.rememberFeedbackContext,
}));
vi.mock(import('@/modules/chat/utils/identity.js'), () => ({
  resolveChatUser: mocks.resolveChatUser,
}));
vi.mock(import('@/modules/chat/utils/requests.js'), () => ({
  applyStreamEvent: mocks.applyStreamEvent,
  getValidatedInferenceModel: mocks.getValidatedInferenceModel,
  hasSavableAnswer: mocks.hasSavableAnswer,
  sendPrompt: mocks.sendPrompt,
}));
vi.mock(import('@/modules/chat/utils/timing.js'), () => ({
  appendTimingFootnote: vi.fn<() => Promise<void>>(async () => {}),
}));

const promptOptions: SendPromptOptions = {
  embeddings_model: undefined,
  inference_model: 'model',
  interface: 'discord',
  max_tokens: undefined,
  messages: [{ content: 'question', role: 'user' }],
  reasoning: undefined,
  temperature: undefined,
  top_p: undefined,
  user_id: '00000000-0000-4000-8000-000000000099',
};

const interaction = (id: string) =>
  ({
    channelId: `channel-${id}`,
    deferred: false,
    guild: null,
    replied: false,
    user: { id: `asker-${id}` },
  }) as Parameters<typeof handlePromptWithStreaming>[0];

const followUpMessage = (reference: string, content: string): Message =>
  ({
    author: { bot: false, id: 'discord-user' },
    channel: {
      isSendable: () => true,
      isThread: () => false,
      sendTyping: async () => {},
    },
    channelId: 'channel-follow-up',
    content,
    guild: null,
    reference: { messageId: reference },
  }) as unknown as Message;

describe('conversation session lifecycle', () => {
  beforeEach(() => {
    mocks.reset();
    mocks.sendPrompt.mockClear();
    mocks.attachFeedbackButtons.mockClear();
  });

  test('uses a fresh UUID per ask and registers the sent UUID with its answer', async () => {
    await handlePromptWithStreaming(interaction('a'), promptOptions, 'ask');
    await handlePromptWithStreaming(interaction('b'), promptOptions, 'ask');

    expect(mocks.sent).toHaveLength(2);
    const [first, second] = mocks.sent;
    expect(first?.sessionId).toMatch(UUID_PATTERN);
    expect(second?.sessionId).toMatch(UUID_PATTERN);
    expect(second?.sessionId).not.toBe(first?.sessionId);
    expect(getConversationSessionId('stream-message-2')).toBe(first?.sessionId);
    expect(getConversationSessionId('stream-message-4')).toBe(
      second?.sessionId,
    );
  });

  test('reuses a reply session while sending the growing history each turn', async () => {
    const rootMessageId = `reply-root-${randomUUID()}`;
    const sessionId = randomUUID();
    registerConversation(
      [rootMessageId],
      [{ content: 'starting question', role: 'user' }],
      sessionId,
    );

    await handleChatMessage(followUpMessage(rootMessageId, 'first follow-up'));
    const firstReplyId = 'stream-message-2';
    await handleChatMessage(followUpMessage(firstReplyId, 'second follow-up'));

    expect(mocks.sent).toHaveLength(2);
    expect(mocks.sent.map(({ sessionId: sentId }) => sentId)).toEqual([
      sessionId,
      sessionId,
    ]);
    expect(mocks.sent[0]?.options.messages).toHaveLength(2);
    expect(mocks.sent[1]?.options.messages).toHaveLength(4);
    expect(getConversationSessionId('stream-message-2')).toBe(sessionId);
    expect(getConversationHistory('stream-message-4')).toHaveLength(5);
  });
});
