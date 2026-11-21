import type { AutocompleteInteraction } from 'discord.js';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { execute } from '@/modules/chat/commands/autocomplete/chat.js';

const mocks = vi.hoisted(() => ({
  getSupportedModels: vi.fn<(userId: string) => Promise<never>>(
    () => new Promise<never>(() => {}),
  ),
  resolveChatUser: vi.fn<() => Promise<{ id: string }>>(async () => ({
    id: 'chat-user',
  })),
}));

vi.mock('@/modules/chat/utils/identity.js', () => ({
  resolveChatUser: mocks.resolveChatUser,
}));

vi.mock('@/modules/chat/utils/requests.js', () => ({
  getSupportedModels: mocks.getSupportedModels,
}));

describe('model autocomplete deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    mocks.resolveChatUser.mockClear();
    mocks.getSupportedModels.mockClear();
    mocks.getSupportedModels.mockReturnValue(new Promise<never>(() => {}));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('responds with no choices when the catalog wait exceeds the deadline', async () => {
    const respond = vi.fn<(choices: unknown[]) => Promise<void>>(
      async () => {},
    );
    const interaction = {
      createdTimestamp: 1_000_000 - 2_750,
      options: { getFocused: () => ({ name: 'inference-model', value: '' }) },
      respond,
      user: { id: 'discord-user' },
    } as unknown as AutocompleteInteraction;

    const pending = execute(interaction);
    await vi.advanceTimersByTimeAsync(100);
    await pending;

    expect(respond).toHaveBeenCalledWith([]);
  });
});
