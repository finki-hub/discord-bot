import type { AutocompleteInteraction } from 'discord.js';

import {
  formatModelLabel,
  isModelSelectable,
  type ModelCatalogResponse,
} from '@/modules/chat/schemas/Model.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import { getSupportedModels } from '@/modules/chat/utils/requests.js';

export const name = 'chat';

// Discord gives autocomplete about three seconds; resolve the chat account
// well inside that window so a slow chatbot cannot leave the request pending.
const AUTOCOMPLETE_USER_TIMEOUT_MS = 2_000;

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

  const chatUser = await resolveChatUser(
    interaction.user,
    AbortSignal.timeout(AUTOCOMPLETE_USER_TIMEOUT_MS),
  );
  const catalog = await getSupportedModels(chatUser.id);
  if (catalog === null) {
    await interaction.respond([]);
    return;
  }

  await interaction.respond(
    getModelAutocompleteChoices(catalog, focused.value),
  );
};
