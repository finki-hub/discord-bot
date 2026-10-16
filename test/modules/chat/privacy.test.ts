import type { ButtonInteraction } from 'discord.js';

import { afterEach, expect, test, vi } from 'vitest';

import { execute as feedback } from '@/modules/chat/commands/button/chatFeedback.js';
import {
  forgetConversations,
  getConversationHistory,
  registerConversation,
} from '@/modules/chat/utils/conversation.js';
import {
  forgetFeedbackContexts,
  getFeedbackContext,
  rememberFeedbackContext,
} from '@/modules/chat/utils/feedback.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import {
  beginChatOperation,
  beginChatOperations,
  conversationPrivacyKey,
  forgetChatUser,
} from '@/modules/chat/utils/privacy.js';

import { requestUrl } from './interactionFixture.js';

afterEach(() => {
  clearChatUserCache('privacy-user');
  forgetConversations('privacy-user');
  forgetConversations('participant');
  forgetFeedbackContexts('privacy-user');
  forgetFeedbackContexts('participant');
});

test('deletion drains work, fences new work and duplicate deletes, then releases on failure', async () => {
  const finish = beginChatOperation('privacy-user');
  expect(finish).not.toBeNull();
  const remove = vi.fn<() => Promise<never>>(async () => {
    throw new Error('delete failed');
  });
  const deletion = forgetChatUser('privacy-user', () => {}, remove);
  const failure = (async () => {
    try {
      await deletion;
      return null;
    } catch (error) {
      return error;
    }
  })();
  expect(beginChatOperation('privacy-user')).toBeNull();
  await expect(
    forgetChatUser(
      'privacy-user',
      () => {},
      async () => {},
    ),
  ).rejects.toThrow('Deletion already in progress');
  expect(remove).not.toHaveBeenCalled();
  finish?.();
  await expect(failure).resolves.toMatchObject({ message: 'delete failed' });
  const laterFinish = beginChatOperation('privacy-user');
  expect(laterFinish).not.toBeNull();
  laterFinish?.();
});

test('shared replies and feedback are invalidated for any conversation participant', async () => {
  const id = 'shared-conversation';
  registerConversation(['root'], [], {
    conversationId: id,
    userId: 'privacy-user',
  });
  registerConversation(
    ['reply'],
    [{ content: 'shared secret', role: 'user' }],
    { conversationId: id, userId: 'participant' },
  );
  rememberFeedbackContext('response', {
    answer: 'secret',
    conversationId: id,
    userId: 'participant',
  });
  const finish = beginChatOperations(['privacy-user', 'participant']);
  const deletion = forgetChatUser(
    'privacy-user',
    () => {
      forgetFeedbackContexts(
        'privacy-user',
        forgetConversations('privacy-user'),
      );
    },
    async () => {},
  );
  expect(beginChatOperations(['participant', 'privacy-user'])).toBeNull();
  finish?.();
  await deletion;
  expect(getConversationHistory('root')).toEqual([]);
  expect(getConversationHistory('reply')).toEqual([]);
  expect(getFeedbackContext('response')).toBeUndefined();
  const unrelated = beginChatOperation('participant');
  expect(unrelated).not.toBeNull();
  unrelated?.();
});

test('a session fence drains earlier participants even if a new participant joins later', async () => {
  const session = conversationPrivacyKey('shared-session');
  const earlier = beginChatOperations(['participant', session]);
  const later = beginChatOperations(['privacy-user', session]);
  const remove = vi.fn<() => Promise<void>>(async () => {});
  const deletion = forgetChatUser(['privacy-user', session], () => {}, remove);
  later?.();
  await Promise.resolve();
  expect(remove).not.toHaveBeenCalled();
  expect(beginChatOperations(['third-user', session])).toBeNull();
  earlier?.();
  await deletion;
  expect(remove).toHaveBeenCalledOnce();
});

test('forget waits for actual pending feedback before deleting and fences new clicks', async () => {
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  vi.stubEnv('API_KEY', 'test-api-key');
  const started = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<Response>();
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (requestUrl(input).pathname === '/chat/state/users') {
      return Response.json({
        id: '00000000-0000-4000-8000-000000000099',
        provider: 'discord',
        provider_subject: 'privacy-user',
      });
    }
    started.resolve(undefined);
    return release.promise;
  });
  vi.stubGlobal('fetch', fetchMock);
  rememberFeedbackContext('feedback-response', {
    answer: 'secret',
    userId: 'privacy-user',
  });
  const reply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const interaction = {
    user: { id: 'privacy-user', avatarURL: () => null, displayName: 'Rater' },
    guild: null,
    message: { id: 'answer' },
    channelId: 'channel',
    deferUpdate: async () => {},
    editReply: async () => {},
    followUp: async () => {},
    reply,
  } as unknown as ButtonInteraction;
  const active = feedback(interaction, [
    'like',
    'feedback-response',
    'privacy-user',
  ]);
  await started.promise;
  const remove = vi.fn<() => Promise<void>>(async () => {});
  const deletion = forgetChatUser(
    'privacy-user',
    () => {
      forgetFeedbackContexts('privacy-user');
    },
    remove,
  );
  await feedback(interaction, ['like', 'feedback-response', 'privacy-user']);
  expect(reply).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(remove).not.toHaveBeenCalled();
  release.resolve(Response.json({}));
  await Promise.all([active, deletion]);
  expect(remove).toHaveBeenCalledOnce();
  expect(getFeedbackContext('feedback-response')).toBeUndefined();
});
