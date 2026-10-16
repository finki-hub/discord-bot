import {
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
  forgetConversations,
  getConversationHistory,
  getConversationId,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import { handleChatThread } from '@/modules/chat/utils/thread.js';
import { commandResponses } from '@/translations/commands.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

describe('chat thread sessions', () => {
  test('rearming an existing thread preserves its session and history', async () => {
    const guildId = `guild-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;
    const threadId = `thread-${randomUUID()}`;
    let createdThreads = 0;
    const welcomes: string[] = [];
    const thread = {
      archived: false,
      id: threadId,
      isThread: () => true,
      locked: false,
      members: { add: async () => {} },
      send: async (content: string) => {
        welcomes.push(content);
      },
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
    const initialConversationId = getConversationId(threadId);
    expect(initialConversationId).toMatch(UUID_PATTERN);
    if (initialConversationId === undefined) {
      throw new Error(
        'Expected a conversation ID for the newly created thread',
      );
    }
    const history = [{ content: 'thread question', role: 'user' as const }];
    registerConversation([threadId], history, initialConversationId);

    await handleChatThread(makeInteraction());

    expect(createdThreads).toBe(1);
    expect(welcomes).toEqual([commandResponses.chatThreadWelcome]);
    expect(welcomes[0]).toContain(commandResponses.chatStorageNotice);
    expect(getConversationId(threadId)).toBe(initialConversationId);
    expect(getConversationHistory(threadId)).toEqual(history);
    forgetConversations(userId);
    // Existing sessions registered by older callers inherit the thread owner.
    expect(getConversationHistory(threadId)).toBeUndefined();
    await handleChatThread(makeInteraction());
    expect(getConversationHistory(threadId)).toEqual([]);
    expect(getConversationId(threadId)).not.toBe(initialConversationId);
  });
});
