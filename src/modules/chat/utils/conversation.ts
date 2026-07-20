import type { ConversationTurn } from '../schemas/Chat.js';

// An answer can span several messages, which all map to one shared entry, so a
// reply to any of them continues the same conversation.

type ConversationEntry = {
  history: ConversationTurn[];
  updatedAt: number;
};

const MAX_TRACKED_MESSAGES = 1_000;
const MAX_HISTORY_TURNS = 9;

const conversations = new Map<string, ConversationEntry>();

const evictOldest = () => {
  while (conversations.size > MAX_TRACKED_MESSAGES) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;

    for (const [key, entry] of conversations) {
      if (entry.updatedAt < oldestAt) {
        oldestAt = entry.updatedAt;
        oldestKey = key;
      }
    }

    if (oldestKey === undefined) {
      break;
    }

    conversations.delete(oldestKey);
  }
};

export const getConversationHistory = (
  messageId: string,
): ConversationTurn[] | undefined => conversations.get(messageId)?.history;

export const registerConversation = (
  messageIds: readonly string[],
  history: ConversationTurn[],
) => {
  if (messageIds.length === 0) {
    return;
  }

  const entry: ConversationEntry = {
    history: history.slice(-MAX_HISTORY_TURNS),
    updatedAt: Date.now(),
  };

  for (const messageId of messageIds) {
    conversations.set(messageId, entry);
  }

  evictOldest();
};
