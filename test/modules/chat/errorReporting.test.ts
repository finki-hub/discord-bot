import type { Message } from 'discord.js';

import { beforeEach, expect, test, vi } from 'vitest';

import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';

import { fakeInteraction } from './interactionFixture.js';

const mocks = vi.hoisted(() => ({
  error: new Error('PRIVATE_PROVIDER_ERROR', {
    cause: new Error('PRIVATE_CAUSE'),
  }),
  logger: { error: vi.fn<() => void>(), warn: vi.fn<() => void>() },
  captureException: vi.fn<() => void>(),
}));
vi.mock('@/common/logger/index.js', () => ({ logger: mocks.logger }));
vi.mock('@/common/services/analytics.js', () => ({
  captureException: mocks.captureException,
  trackCommandInvoked: vi.fn<() => void>(),
  trackMessageAnswered: vi.fn<() => void>(),
}));
vi.mock('@/common/utils/messages.js', () => ({
  safeStreamReplyToInteraction: () => {
    throw mocks.error;
  },
  safeStreamReplyToMessage: () => {
    throw mocks.error;
  },
  safeEphemeralReplyToInteraction: vi.fn<() => Promise<void>>(),
}));
vi.mock('@/modules/chat/utils/conversation.js', () => ({
  getConversationHistory: () => [{ content: 'old question', role: 'user' }],
}));
vi.mock('@/modules/chat/utils/identity.js', () => ({
  resolveChatUser: () => {
    throw mocks.error;
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<() => never>(() => {
      throw new Error('Network forbidden');
    }),
  );
});

test('streaming failure keeps its reply and safe guild alert', async () => {
  const driver = fakeInteraction('chat', 'query', 'test-user');
  await handlePromptWithStreaming(
    driver.interaction,
    {
      embeddings_model: undefined,
      inference_model: undefined,
      interface: 'discord',
      max_tokens: undefined,
      messages: [{ content: 'question', role: 'user' }],
      reasoning: undefined,
      temperature: undefined,
      top_p: undefined,
      user_id: 'test-user',
    },
    'PRIVATE_DYNAMIC_LABEL',
  );
  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Failed streaming chat response (error)',
    { guildId: driver.interaction.guild?.id },
  );
  expect(mocks.captureException).toHaveBeenCalledOnce();
  expect(driver.state.calls).toHaveLength(1);
  expect(
    JSON.stringify([driver.state.calls, mocks.logger.error.mock.calls]),
  ).not.toContain('PRIVATE_');
});

test('conversation failure keeps its reply and safe alert', async () => {
  const reply = vi.fn<() => Promise<void>>(async () => {});
  const message = {
    author: { bot: false, id: 'test-user' },
    channel: { isThread: () => false },
    reference: { messageId: 'message-id' },
    content: 'question',
    guild: null,
    reply,
  } as unknown as Message;
  await handleChatMessage(message);
  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Failed continuing chat conversation (error)',
    { guildId: undefined },
  );
  expect(mocks.captureException).toHaveBeenCalledOnce();
  expect(reply).toHaveBeenCalledOnce();
  expect(
    JSON.stringify([reply.mock.calls, mocks.logger.error.mock.calls]),
  ).not.toContain('PRIVATE_');
});
