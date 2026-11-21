import type { User } from 'discord.js';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ChatApiError } from '@/modules/chat/schemas/Credentials.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';

const USER_ID = '00000000-0000-4000-8000-000000000099';

const user = {
  avatarURL: () => null,
  displayName: 'Timeout Test',
  id: USER_ID,
} as unknown as User;

describe('chat user resolution', () => {
  beforeEach(() => {
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
    vi.stubEnv('API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('sends a timeout signal and maps timeouts to ChatApiError', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, requestInit) => {
      expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException('timed out', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetchMock);

    let error: unknown;
    try {
      await resolveChatUser(user);
    } catch (error_: unknown) {
      error = error_;
    }

    expect(error).toBeInstanceOf(ChatApiError);
    expect(error).toMatchObject({ status: 503 });

    const [input, sentInit] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe('https://chatbot.invalid/chat/state/users');
    expect(sentInit?.signal).toBeInstanceOf(AbortSignal);
  });
});
