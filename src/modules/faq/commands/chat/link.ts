import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getNormalizedUrl } from '@/modules/faq/utils/links.js';
import { getClosestLink } from '@/modules/faq/utils/search.js';
import {
  commandDescriptions,
  commandErrors,
  commandResponseFunctions,
} from '@/translations/commands.js';

export const name = 'link';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name])
  .addStringOption((option) =>
    option
      .setName('link')
      .setDescription('Линк')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('Корисник').setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const keyword = interaction.options.getString('link', true);
  const user = interaction.options.getUser('user');

  const parsedKeyword = Number(keyword);
  const link = await getClosestLink(
    Number.isSafeInteger(parsedKeyword) && parsedKeyword > 0
      ? parsedKeyword
      : keyword,
  );

  if (link === null) {
    await interaction.editReply(commandErrors.linkNotFound);

    return;
  }

  const normalizedUrl = getNormalizedUrl(link.url);

  await interaction.editReply({
    content: user
      ? `${commandResponseFunctions.commandFor(user.id)}\n${normalizedUrl}`
      : normalizedUrl,
    flags: MessageFlags.SuppressEmbeds,
  });
};
