import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
  forgetConversations,
  getConversationHistory,
  getConversationId,
  getPersistenceConversation,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

describe('conversation sessions', () => {
  test('maps answer messages to one session and keeps separate conversations isolated', () => {
    const firstMessage = `conversation-a-${randomUUID()}`;
    const answerMessage = `conversation-a-answer-${randomUUID()}`;
    const secondMessage = `conversation-b-${randomUUID()}`;
    const history = [{ content: 'question', role: 'user' as const }];

    registerConversation([firstMessage, answerMessage], history);
    registerConversation([secondMessage], history);

    const firstConversationId = getConversationId(firstMessage);
    expect(firstConversationId).toMatch(UUID_PATTERN);
    expect(getConversationId(answerMessage)).toBe(firstConversationId);
    expect(getConversationId(secondMessage)).not.toBe(firstConversationId);
    expect(getConversationHistory(firstMessage)).toEqual(history);
  });

  test('preserves an existing session when an answer is re-registered', () => {
    const messageId = `conversation-followup-${randomUUID()}`;
    const conversationId = randomUUID();

    registerConversation(
      [messageId],
      [{ content: 'first', role: 'user' }],
      conversationId,
    );
    registerConversation(
      [messageId],
      [
        { content: 'first', role: 'user' },
        { content: 'answer', role: 'assistant' },
        { content: 'follow-up', role: 'user' },
      ],
      conversationId,
    );

    expect(getConversationId(messageId)).toBe(conversationId);
    expect(getConversationHistory(messageId)).toHaveLength(3);
  });

  test('an active partition handle survives alias eviction without borrowing another owner ID', () => {
    const root = randomUUID();
    const logicalId = randomUUID();
    registerConversation([root], [{ role: 'user', content: 'A secret' }], {
      accountId: 'internal-a',
      conversationId: logicalId,
      userId: 'owner-a',
    });
    const active = getPersistenceConversation(root, {
      id: 'internal-b',
      userId: 'owner-b',
    });
    registerConversation(
      Array.from({ length: 1_001 }, () => randomUUID()),
      [],
      { userId: 'noise' },
    );
    expect(getConversationId(root)).toBeUndefined();
    registerConversation(
      ['restored-answer'],
      [{ role: 'user', content: 'A secret' }],
      active.session,
    );
    expect(
      getPersistenceConversation('restored-answer', {
        id: 'internal-a',
        userId: 'owner-a',
      }).id,
    ).toBe(logicalId);
    expect(
      getPersistenceConversation('restored-answer', {
        id: 'internal-b',
        userId: 'owner-b',
      }).id,
    ).toBe(active.id);
    forgetConversations('owner-a');
    expect(getConversationHistory('restored-answer')).toEqual([]);
    expect(
      getPersistenceConversation('restored-answer', {
        id: 'internal-b',
        userId: 'owner-b',
      }).id,
    ).toBe(active.id);
    forgetConversations('owner-b');
    forgetConversations('noise');
  });
});
