import {
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
  getConversationHistory,
  getConversationSessionId,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { handleChatThread } from '@/modules/chat/utils/thread.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

describe('chat thread sessions', () => {
  test('rearming an existing thread preserves its session and history', async () => {
    const guildId = `guild-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;
    const threadId = `thread-${randomUUID()}`;
    let createdThreads = 0;
    const thread = {
      archived: false,
      id: threadId,
      isThread: () => true,
      locked: false,
      members: { add: async () => {} },
      send: async () => {},
    };
    const channel = {
      threads: {
        create: async () => {
          createdThreads += 1;
          return thread;
        },
      },
      type: ChannelType.GuildText,
    };
    const guild = {
      channels: {
        fetch: async () => thread,
      },
      id: guildId,
    } as unknown as Guild;
    const makeInteraction = (): ChatInputCommandInteraction =>
      ({
        channel,
        deferReply: async () => {},
        editReply: async () => {},
        guild,
        user: { displayName: 'Test User', id: userId },
      }) as unknown as ChatInputCommandInteraction;

    await handleChatThread(makeInteraction());
    const initialSessionId = getConversationSessionId(threadId);
    expect(initialSessionId).toMatch(UUID_PATTERN);
    if (initialSessionId === undefined) {
      throw new Error('Expected a session for the newly created thread');
    }
    const history = [{ content: 'thread question', role: 'user' as const }];
    registerConversation([threadId], history, initialSessionId);

    await handleChatThread(makeInteraction());

    expect(createdThreads).toBe(1);
    expect(getConversationSessionId(threadId)).toBe(initialSessionId);
    expect(getConversationHistory(threadId)).toEqual(history);
  });
});
