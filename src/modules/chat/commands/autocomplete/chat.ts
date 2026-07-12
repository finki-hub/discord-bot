import type { AutocompleteInteraction } from 'discord.js';

import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import { getSupportedModels } from '@/modules/chat/utils/requests.js';

export const name = 'chat';

export const execute = async (interaction: AutocompleteInteraction) => {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'inference-model') {
    await interaction.respond([]);
    return;
  }

  const chatUser = await resolveChatUser(interaction.user);
  const catalog = await getSupportedModels(chatUser.id);
  if (catalog === null) {
    await interaction.respond([]);
    return;
  }

  const query = focused.value.toLocaleLowerCase();
  await interaction.respond(
    catalog.models
      .filter(
        ({ id, name: modelName }) =>
          id.toLocaleLowerCase().includes(query) ||
          modelName.toLocaleLowerCase().includes(query),
      )
      .slice(0, 25)
      .map(({ id, name: modelName, provider }) => ({
        name: `${modelName} (${provider})`.slice(0, 100),
        value: id,
      })),
  );
};
