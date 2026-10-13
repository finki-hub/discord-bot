import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
  getConversationHistory,
  getConversationSessionId,
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

    const firstSessionId = getConversationSessionId(firstMessage);
    expect(firstSessionId).toMatch(UUID_PATTERN);
    expect(getConversationSessionId(answerMessage)).toBe(firstSessionId);
    expect(getConversationSessionId(secondMessage)).not.toBe(firstSessionId);
    expect(getConversationHistory(firstMessage)).toEqual(history);
  });

  test('preserves an existing session when an answer is re-registered', () => {
    const messageId = `conversation-followup-${randomUUID()}`;
    const sessionId = randomUUID();

    registerConversation(
      [messageId],
      [{ content: 'first', role: 'user' }],
      sessionId,
    );
    registerConversation(
      [messageId],
      [
        { content: 'first', role: 'user' },
        { content: 'answer', role: 'assistant' },
        { content: 'follow-up', role: 'user' },
      ],
      sessionId,
    );

    expect(getConversationSessionId(messageId)).toBe(sessionId);
    expect(getConversationHistory(messageId)).toHaveLength(3);
  });
});
