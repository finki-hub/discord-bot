import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { beforeEach, expect, test, vi } from 'vitest';

import type { ChatCommand, ContextMenuCommand } from '@/core/lib/Command.js';

import { handleMessageContextMenuCommand } from '@/core/commands/contextMenuHandlers.js';
import { handleChatInputCommand } from '@/core/commands/handlers.js';

const mocks = vi.hoisted(() => ({
  executeChatInput: vi.fn<
    (interaction: ChatInputCommandInteraction) => Promise<void>
  >(async () => {}),
  executeContextMenu: vi.fn<
    (interaction: MessageContextMenuCommandInteraction) => Promise<void>
  >(async () => {}),
  getChatCommand: vi.fn<(name: string) => ChatCommand | undefined>(),
  getCommandModule: vi.fn<(name: string) => string>(() => 'chat'),
  getContextMenuCommand:
    vi.fn<(name: string) => ContextMenuCommand | undefined>(),
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
  getContextMenuCommand: mocks.getContextMenuCommand,
}));

const fakeChatInteraction = (
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

const fakeContextInteraction = () => {
  const deferReply = vi.fn<(payload?: unknown) => Promise<void>>(
    async () => {},
  );
  const interaction = {
    commandName: 'Prompt Privately',
    deferred: false,
    guild: null,
    guildId: null,
    replied: false,
    user: { id: 'user-id', tag: 'user#0001' },
    deferReply,
  } as unknown as MessageContextMenuCommandInteraction;

  return { deferReply, interaction };
};

const contextCommand = (ephemeral: boolean) =>
  ({
    ephemeral,
    execute: mocks.executeContextMenu,
    name: 'Prompt Privately',
  }) as unknown as ContextMenuCommand;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getChatCommand.mockReturnValue({
    execute: mocks.executeChatInput,
  } as unknown as ChatCommand);
});

test('defers a private ask ephemerally before executing it', async () => {
  const { deferReply, interaction } = fakeChatInteraction(true);

  await handleChatInputCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(mocks.executeChatInput).toHaveBeenCalledWith(interaction);
});

test('keeps a public ask public', async () => {
  const { deferReply, interaction } = fakeChatInteraction(false);

  await handleChatInputCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith(undefined);
  expect(mocks.executeChatInput).toHaveBeenCalledWith(interaction);
});

test('ignores a non-boolean private option', async () => {
  const { deferReply, interaction } = fakeChatInteraction(
    true,
    ApplicationCommandOptionType.String,
  );

  await handleChatInputCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith(undefined);
  expect(mocks.executeChatInput).toHaveBeenCalledWith(interaction);
});

test('defers a private prompt context command ephemerally', async () => {
  mocks.getContextMenuCommand.mockReturnValue(contextCommand(true));
  const { deferReply, interaction } = fakeContextInteraction();

  await handleMessageContextMenuCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(mocks.executeContextMenu).toHaveBeenCalledWith(interaction);
});

test('keeps a public prompt context command public', async () => {
  mocks.getContextMenuCommand.mockReturnValue(contextCommand(false));
  const { deferReply, interaction } = fakeContextInteraction();

  await handleMessageContextMenuCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith(undefined);
  expect(mocks.executeContextMenu).toHaveBeenCalledWith(interaction);
});
