import { type ButtonInteraction, MessageFlags } from 'discord.js';

import type { PaginationHandlerData } from '@/common/types/PaginationHandlerData.js';

import { commandErrors } from '@/translations/commands.js';

// The buttons belong to the message's original invoker. Checking this is local
// work, so callers run it before acknowledging the interaction.
export const verifyPaginationInteraction = async (
  interaction: ButtonInteraction,
): Promise<boolean> => {
  const ownerId = interaction.message.interactionMetadata?.user.id;

  if (ownerId === undefined || interaction.user.id === ownerId) {
    return true;
  }

  const rejectionMessage = commandErrors.buttonNoPermission;

  await (interaction.deferred
    ? interaction.followUp({
        content: rejectionMessage,
        flags: MessageFlags.Ephemeral,
      })
    : interaction.reply({
        content: rejectionMessage,
        flags: MessageFlags.Ephemeral,
      }));

  return false;
};

export const handlePagination = async <T>({
  entries,
  getComponent,
  interaction,
  paginationArguments,
}: PaginationHandlerData<T>) => {
  if (!(await verifyPaginationInteraction(interaction))) {
    return;
  }

  const [action, pageStr] = paginationArguments;
  const page = action === 'page' && pageStr ? Number.parseInt(pageStr, 10) : 0;
  const component = getComponent(entries, page);

  try {
    // Callers that fetch entries first acknowledge with `deferUpdate`, so the
    // page render becomes an edit of that deferred response.
    await (interaction.deferred || interaction.replied
      ? interaction.editReply({
          components: [component],
          flags: MessageFlags.IsComponentsV2,
        })
      : interaction.update({
          components: [component],
          flags: MessageFlags.IsComponentsV2,
        }));
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
