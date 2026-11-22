import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { safeEphemeralReplyToInteraction } from '@/common/utils/messages.js';
import { getLinks } from '@/modules/faq/utils/api.js';
import { getListLinksComponent } from '@/modules/list/components/components.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'links';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const links = await getLinks();

  if (links === null) {
    await safeEphemeralReplyToInteraction(
      interaction,
      commandErrors.linksFetchFailed,
    );

    return;
  }

  await interaction.editReply({
    components: [getListLinksComponent(links, 0)],
    flags: MessageFlags.IsComponentsV2,
  });
};
