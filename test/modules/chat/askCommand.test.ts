import type { ChatInputCommandInteraction } from 'discord.js';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';
import type { ChatUser } from '@/modules/chat/schemas/Credentials.js';

import { data, execute } from '@/modules/chat/commands/chat/ask.js';

type HandlePromptMock = (
  interaction: ChatInputCommandInteraction,
  options: SendPromptOptions,
  commandLabel: string,
) => Promise<void>;
type ResolveChatUserMock = (
  interaction: ChatInputCommandInteraction,
) => Promise<ChatUser | null>;
type ResolveModelMock = (
  userId: string,
  configuredModel: string | undefined,
) => Promise<string | undefined>;

const mocks = vi.hoisted(() => ({
  handlePrompt: vi.fn<HandlePromptMock>(async () => {}),
  resolveChatUser: vi.fn<ResolveChatUserMock>(async () => ({
    id: '00000000-0000-4000-8000-000000000001',
    provider: 'discord',
    provider_subject: 'discord-user',
  })),
  resolveModel: vi.fn<ResolveModelMock>(async () => 'gpt-5.6-luna'),
}));

vi.mock('@/modules/chat/utils/interaction.js', () => ({
  resolveInteractionChatUser: mocks.resolveChatUser,
}));

vi.mock('@/modules/chat/utils/requests.js', () => ({
  getSupportedModels: vi.fn<() => Promise<null>>(async () => null),
  getValidatedInferenceModel: mocks.resolveModel,
}));

vi.mock('@/modules/chat/utils/streaming.js', () => ({
  handlePromptWithStreaming: mocks.handlePrompt,
}));

describe('/ask command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('exposes only the prompt option', () => {
    const optionNames = data.toJSON().options?.map((option) => option.name);

    expect(optionNames).toEqual(['prompt']);
  });

  test('disables reasoning without reading an interaction option', async () => {
    const getBoolean = vi.fn<(name: string) => boolean>(() => true);
    const interaction = {
      guild: null,
      options: {
        getBoolean,
        getNumber: () => null,
        getString: (name: string) => (name === 'prompt' ? 'question' : null),
      },
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    expect(getBoolean).not.toHaveBeenCalled();
    expect(mocks.handlePrompt).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({ reasoning: false }),
      'chat query command',
    );
  });
});
