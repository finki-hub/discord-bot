import type { AutocompleteInteraction } from 'discord.js';

import { withTimeout } from '@/common/utils/timeout.js';
import {
  formatModelLabel,
  isModelSelectable,
  type ModelCatalogResponse,
} from '@/modules/chat/schemas/Model.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import { getSupportedModels } from '@/modules/chat/utils/requests.js';

export const name = 'chat';

// Discord closes the autocomplete window at three seconds; leave a little room
// to actually send the response.
const AUTOCOMPLETE_DEADLINE_MS = 2_800;
const AUTOCOMPLETE_USER_TIMEOUT_MS = 2_000;

const remainingBudget = (interaction: AutocompleteInteraction) => {
  const elapsed = Date.now() - interaction.createdTimestamp;
  return Number.isFinite(elapsed)
    ? AUTOCOMPLETE_DEADLINE_MS - elapsed
    : AUTOCOMPLETE_DEADLINE_MS;
};

export type ModelAutocompleteChoice = {
  readonly name: string;
  readonly value: string;
};

export const getModelAutocompleteChoices = (
  catalog: ModelCatalogResponse,
  query: string,
): ModelAutocompleteChoice[] => {
  const normalizedQuery = query.toLocaleLowerCase();

  return catalog.models
    .filter(isModelSelectable)
    .filter(
      ({ id, name: modelName }) =>
        id.toLocaleLowerCase().includes(normalizedQuery) ||
        modelName.toLocaleLowerCase().includes(normalizedQuery),
    )
    .slice(0, 25)
    .map(({ id, ...model }) => ({
      name: formatModelLabel({ id, ...model }),
      value: id,
    }));
};

export const execute = async (interaction: AutocompleteInteraction) => {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'inference-model') {
    await interaction.respond([]);
    return;
  }

  const userBudget = remainingBudget(interaction);
  if (userBudget <= 0) {
    await interaction.respond([]);
    return;
  }

  const chatUser = await resolveChatUser(
    interaction.user,
    AbortSignal.timeout(Math.min(AUTOCOMPLETE_USER_TIMEOUT_MS, userBudget)),
  );

  const catalogBudget = remainingBudget(interaction);
  if (catalogBudget <= 0) {
    await interaction.respond([]);
    return;
  }

  let catalog: ModelCatalogResponse | null = null;
  try {
    catalog = await withTimeout(
      getSupportedModels(chatUser.id),
      catalogBudget,
      'Autocomplete catalog timeout',
    );
  } catch {
    // The shared catalog request keeps running and will populate the cache;
    // this autocomplete window is already closing.
  }

  if (catalog === null) {
    await interaction.respond([]);
    return;
  }

  await interaction.respond(
    getModelAutocompleteChoices(catalog, focused.value),
  );
};
