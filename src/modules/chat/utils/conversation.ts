import { randomUUID } from 'node:crypto';

import type { ConversationTurn } from '../schemas/Chat.js';

// An answer can span several messages, which all map to one shared entry, so a
// reply to any of them continues the same conversation.

type ConversationEntry = {
  conversationId: string;
  history: ConversationTurn[];
  partitions: Map<string, { id: string; userId: string }>;
  updatedAt: number;
  userIds: Set<string>;
};

type ConversationSession = {
  accountId?: string;
  conversationId?: string;
  participants?: ReadonlySet<string>;
  partitions?: ConversationEntry['partitions'];
  userId: string;
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

export const getConversationId = (messageId: string): string | undefined =>
  conversations.get(messageId)?.conversationId;

export const getConversationUsers = (messageId: string): string[] => [
  ...(conversations.get(messageId)?.userIds ?? []),
];

// Local context is shared; durable transcripts belong to one internal account.
export const getPersistenceConversation = (
  messageId: string,
  account: { id: string; userId: string },
): { id: string; session: ConversationSession } => {
  const entry = conversations.get(messageId);
  if (entry === undefined) throw new Error('LLM_UNAVAILABLE');
  const partition = entry.partitions.getOrInsertComputed(account.id, () => ({
    id: randomUUID(),
    userId: account.userId,
  }));
  // Retain the partition map while a request is in flight, even if its message
  // aliases are evicted from the bounded lookup cache before finalization.
  return {
    id: partition.id,
    session: {
      accountId: account.id,
      conversationId: entry.conversationId,
      participants: entry.userIds,
      partitions: entry.partitions,
      userId: account.userId,
    },
  };
};

export const rememberConversationParticipant = (
  messageId: string,
  userId: string,
) => {
  const id = getConversationId(messageId);
  if (id === undefined) return;
  for (const entry of conversations.values()) {
    if (entry.conversationId === id) entry.userIds.add(userId);
  }
};

const seedPersistencePartition = (
  partitions: ConversationEntry['partitions'],
  options: Partial<ConversationSession>,
  conversationId: string,
) => {
  if (options.accountId === undefined || options.userId === undefined) return;
  const userId = options.userId;
  partitions.getOrInsertComputed(options.accountId, () => ({
    id: conversationId,
    userId,
  }));
};

export const registerConversation = (
  messageIds: readonly string[],
  history: ConversationTurn[],
  session: ConversationSession | string = randomUUID(),
) => {
  if (messageIds.length === 0) {
    return;
  }

  const options: Partial<ConversationSession> =
    typeof session === 'string' ? { conversationId: session } : session;
  const conversationId = options.conversationId ?? randomUUID();
  const userIds = new Set(options.participants);
  let partitions: ConversationEntry['partitions'] =
    options.partitions ?? new Map<string, { id: string; userId: string }>();
  for (const existing of conversations.values()) {
    if (existing.conversationId === conversationId) {
      partitions = existing.partitions;
      for (const userId of existing.userIds) userIds.add(userId);
    }
  }
  if (options.userId !== undefined) userIds.add(options.userId);
  for (const partition of partitions.values()) userIds.add(partition.userId);
  seedPersistencePartition(partitions, options, conversationId);
  for (const existing of conversations.values()) {
    if (existing.conversationId === conversationId) existing.userIds = userIds;
  }
  const entry: ConversationEntry = {
    conversationId,
    history: history.slice(-MAX_HISTORY_TURNS),
    partitions,
    updatedAt: Date.now(),
    userIds,
  };

  for (const messageId of messageIds) {
    conversations.set(messageId, entry);
  }

  evictOldest();
};

export const getUserConversationIds = (userId: string) => {
  const ids = new Set<string>();
  for (const entry of conversations.values()) {
    if (entry.userIds.has(userId)) ids.add(entry.conversationId);
  }
  return ids;
};

export const forgetConversations = (userId: string) => {
  const ids = getUserConversationIds(userId);
  for (const [key, entry] of conversations) {
    if (!ids.has(entry.conversationId)) continue;
    for (const [accountId, partition] of entry.partitions) {
      if (partition.userId === userId) entry.partitions.delete(accountId);
    }
    entry.userIds.delete(userId);
    // Mixed history can quote the forgotten participant. Drop it, not another
    // participant's persistence ID or their already-stored owned exchanges.
    entry.history = [];
    if (entry.userIds.size === 0) conversations.delete(key);
  }
  return ids;
};
