import { type AutocompleteInteraction } from 'discord.js';
import { beforeEach, expect, test, vi } from 'vitest';

import { handleAutocomplete } from '@/core/commands/autocompleteHandler.js';

type AutocompleteCommand = {
  execute: (interaction: AutocompleteInteraction) => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  execute: vi.fn<(interaction: AutocompleteInteraction) => Promise<void>>(),
  getAutocompleteCommand:
    vi.fn<(name: string) => AutocompleteCommand | undefined>(),
  getCommandModule: vi.fn<(name: string) => string>(() => 'test'),
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
  getAutocompleteCommand: mocks.getAutocompleteCommand,
  getCommandModule: mocks.getCommandModule,
}));

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.getAutocompleteCommand.mockReset();
  mocks.trackInteraction.mockReset();
});

test('responds once when the command already answered', async () => {
  let responded = false;
  const respond = vi.fn<() => Promise<void>>(async () => {
    if (responded) {
      throw new Error('Interaction has already been acknowledged.');
    }
    responded = true;
  });
  const interaction = {
    commandName: 'faq',
    get responded() {
      return responded;
    },
    guild: null,
    guildId: null,
    respond,
    user: { id: 'user-id', tag: 'user#0001' },
  } as unknown as AutocompleteInteraction;

  mocks.execute.mockImplementation(
    async (autocomplete: AutocompleteInteraction) => {
      await autocomplete.respond([]);
    },
  );
  mocks.getAutocompleteCommand.mockReturnValue({ execute: mocks.execute });

  await handleAutocomplete(interaction);

  expect(respond).toHaveBeenCalledOnce();
  expect(mocks.trackInteraction).toHaveBeenCalledOnce();
});
