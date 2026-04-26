import { MessageFlags } from 'discord.js';

import type { PaginationHandlerData } from '@/common/types/PaginationHandlerData.js';

import { commandErrors } from '@/translations/commands.js';

export const handlePagination = async <T>({
  entries,
  getComponent,
  interaction,
  paginationArguments,
}: PaginationHandlerData<T>) => {
  const [action, pageStr] = paginationArguments;

  if (
    interaction.message.interactionMetadata?.user.id !== undefined &&
    interaction.user.id !== interaction.message.interactionMetadata.user.id
  ) {
    await interaction.reply({
      content: commandErrors.buttonNoPermission,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const page = action === 'page' && pageStr ? Number.parseInt(pageStr, 10) : 0;

  try {
    await interaction.update({
      components: [getComponent(entries, page)],
      flags: MessageFlags.IsComponentsV2,
    });
  } catch (error) {
    const errorMessage = Error.isError(error) ? error.message : String(error);
    if (
      errorMessage.includes('Unknown interaction') ||
      errorMessage.includes('already been acknowledged')
    ) {
      return;
    }
    throw error;
  }
};
