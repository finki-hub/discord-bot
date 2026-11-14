import { type ButtonInteraction, MessageFlags } from 'discord.js';

import { buildFeedbackReasonModal } from '@/modules/chat/utils/feedback.js';
import { commandErrors } from '@/translations/commands.js';

export const name = 'chatFeedbackReason';

// Opens the reason form for an answer the asker just disliked.
export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [responseId, askerId] = args;

  if (responseId === undefined || askerId === undefined) {
    await interaction.reply({
      content: commandErrors.commandError,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== askerId) {
    await interaction.reply({
      content: commandErrors.buttonNoPermission,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.showModal(buildFeedbackReasonModal(responseId));
};
