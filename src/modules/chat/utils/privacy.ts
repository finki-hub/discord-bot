import { ChatApiError } from '../schemas/Credentials.js';

// A deletion fences new work and drains all work already using this user's data.
// Keep the lease until Discord finalization too, not just until fetch resolves.
type UserWork = {
  deleting: boolean;
  pending: Set<Promise<void>>;
};

const users = new Map<string, UserWork>();

export const beginChatOperation = (userId: string): (() => void) | null => {
  let work = users.get(userId);
  if (work?.deleting === true) return null;
  work ??= { deleting: false, pending: new Set() };
  users.set(userId, work);
  const { promise, resolve } = Promise.withResolvers<undefined>();
  work.pending.add(promise);
  return () => {
    if (!work.pending.delete(promise)) return;
    resolve(undefined);
    if (!work.deleting && work.pending.size === 0) users.delete(userId);
  };
};

export const forgetChatUser = async <T>(
  userId: readonly string[] | string,
  clear: () => void,
  remove: () => Promise<T>,
): Promise<T> => {
  const ids = typeof userId === 'string' ? [userId] : [...new Set(userId)];
  if (ids.some((id) => users.get(id)?.deleting === true))
    throw new ChatApiError(409, 'Deletion already in progress');
  const work = ids.map((id) =>
    users.getOrInsertComputed(id, () => ({
      deleting: false,
      pending: new Set(),
    })),
  );
  for (const entry of work) entry.deleting = true;
  try {
    await Promise.all(work.flatMap((entry) => [...entry.pending]));
    clear();
    return await remove();
  } finally {
    clear();
    for (const id of ids) users.delete(id);
  }
};

export const conversationPrivacyKey = (conversationId: string) =>
  `conversation:${conversationId}`;

export const beginChatOperations = (
  userIds: Iterable<string>,
): (() => void) | null => {
  const finishes: Array<() => void> = [];
  const uniqueUsers = new Set(userIds);
  for (const userId of uniqueUsers) {
    const finish = beginChatOperation(userId);
    if (finish === null) {
      for (const complete of finishes) complete();
      return null;
    }
    finishes.push(finish);
  }
  return () => {
    for (const finish of finishes) finish();
  };
};
