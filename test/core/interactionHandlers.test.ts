import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { beforeEach, expect, test, vi } from 'vitest';

import type { ChatCommand } from '@/core/lib/Command.js';

import { handleChatInputCommand } from '@/core/commands/handlers.js';

const mocks = vi.hoisted(() => ({
  execute: vi.fn<(interaction: ChatInputCommandInteraction) => Promise<void>>(
    async () => {},
  ),
  getChatCommand: vi.fn<(name: string) => ChatCommand | undefined>(),
  getCommandModule: vi.fn<(name: string) => string>(() => 'chat'),
}));

vi.mock('@/common/logger/index.js', () => ({
  logger: {
    error: vi.fn<(...arguments_: unknown[]) => void>(),
    info: vi.fn<(...arguments_: unknown[]) => void>(),
  },
}));
vi.mock('@/common/services/analytics.js', () => ({
  trackInteraction: vi.fn<(...arguments_: unknown[]) => void>(),
}));
vi.mock('@/core/commands/modules.js', () => ({
  getChatCommand: mocks.getChatCommand,
  getCommandModule: mocks.getCommandModule,
}));

const fakeInteraction = (
  privateOption: boolean,
  privateType = ApplicationCommandOptionType.Boolean,
) => {
  const deferReply = vi.fn<(payload?: unknown) => Promise<void>>(
    async () => {},
  );
  const interaction = {
    commandName: 'ask',
    deferred: false,
    guild: null,
    guildId: null,
    options: {
      get: (name: string) =>
        name === 'private' ? { type: privateType, value: privateOption } : null,
      getSubcommand: () => null,
      getSubcommandGroup: () => null,
    },
    replied: false,
    user: { id: 'user-id', tag: 'user#0001' },
    deferReply,
  } as unknown as ChatInputCommandInteraction;

  return { deferReply, interaction };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getChatCommand.mockReturnValue({
    execute: mocks.execute,
  } as unknown as ChatCommand);
});

test('defers a private ask ephemerally before executing it', async () => {
  const { deferReply, interaction } = fakeInteraction(true);

  await handleChatInputCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(mocks.execute).toHaveBeenCalledWith(interaction);
});

test('keeps a public ask public', async () => {
  const { deferReply, interaction } = fakeInteraction(false);

  await handleChatInputCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith(undefined);
  expect(mocks.execute).toHaveBeenCalledWith(interaction);
});

test('ignores a non-boolean private option', async () => {
  const { deferReply, interaction } = fakeInteraction(
    true,
    ApplicationCommandOptionType.String,
  );

  await handleChatInputCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith(undefined);
  expect(mocks.execute).toHaveBeenCalledWith(interaction);
});
