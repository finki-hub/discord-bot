import {
  type MessageContextMenuCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { beforeEach, expect, test, vi } from 'vitest';

import type { ChatCommand, ContextMenuCommand } from '@/core/lib/Command.js';

import { handleMessageContextMenuCommand } from '@/core/commands/contextMenuHandlers.js';

const mocks = vi.hoisted(() => ({
  execute: vi.fn<
    (interaction: MessageContextMenuCommandInteraction) => Promise<void>
  >(async () => {}),
  getChatCommand: vi.fn<(name: string) => ChatCommand | undefined>(),
  getCommandModule: vi.fn<(name: string) => string>(() => 'chat'),
  getContextMenuCommand:
    vi.fn<(name: string) => ContextMenuCommand | undefined>(),
  logger: {
    error: vi.fn<(...arguments_: unknown[]) => void>(),
    info: vi.fn<(...arguments_: unknown[]) => void>(),
  },
  trackInteraction: vi.fn<(...arguments_: unknown[]) => void>(),
}));

vi.mock('@/common/logger/index.js', () => ({ logger: mocks.logger }));
vi.mock('@/common/services/analytics.js', () => ({
  trackInteraction: mocks.trackInteraction,
}));
vi.mock('@/core/commands/modules.js', () => ({
  getChatCommand: mocks.getChatCommand,
  getCommandModule: mocks.getCommandModule,
  getContextMenuCommand: mocks.getContextMenuCommand,
}));

const fakeInteraction = () => {
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

const command = (ephemeral: boolean) =>
  ({
    ephemeral,
    execute: mocks.execute,
    name: 'Prompt Privately',
  }) as unknown as ContextMenuCommand;

beforeEach(() => {
  vi.clearAllMocks();
});

test('defers a private prompt context command ephemerally', async () => {
  mocks.getContextMenuCommand.mockReturnValue(command(true));
  const { deferReply, interaction } = fakeInteraction();

  await handleMessageContextMenuCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  expect(mocks.execute).toHaveBeenCalledWith(interaction);
});

test('keeps a public prompt context command public', async () => {
  mocks.getContextMenuCommand.mockReturnValue(command(false));
  const { deferReply, interaction } = fakeInteraction();

  await handleMessageContextMenuCommand(interaction);

  expect(deferReply).toHaveBeenCalledWith(undefined);
  expect(mocks.execute).toHaveBeenCalledWith(interaction);
});
