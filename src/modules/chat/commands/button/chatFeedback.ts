import { type ButtonInteraction, MessageFlags } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { FeedbackOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import {
  buildFeedbackRow,
  getFeedbackContext,
  isFeedbackEnabled,
} from '@/modules/chat/utils/feedback.js';
import { sendFeedback } from '@/modules/chat/utils/requests.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

export const name = 'chatFeedback';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [action, responseId, askerId] = args;

  if (
    (action !== 'like' && action !== 'dislike') ||
    responseId === undefined ||
    askerId === undefined
  ) {
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

  if (!(await isFeedbackEnabled(interaction.guild?.id ?? null))) {
    await interaction.reply({
      content: commandErrors.feedbackDisabled,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  // deferUpdate (not deferReply) so the later editReply edits the source answer
  // message — recolouring its buttons — rather than posting a new ephemeral reply.
  await interaction.deferUpdate();

  const context = getFeedbackContext(responseId);

  const options = FeedbackOptionsSchema.parse({
    answerText: context?.answer,
    channelId: interaction.channelId,
    client: 'discord',
    clientRef: interaction.message.id,
    feedbackType: action,
    guildId: interaction.guild?.id,
    questionText: context?.question,
    responseId,
    userId: interaction.user.id,
  });

  if (!(await sendFeedback(options))) {
    await interaction.followUp({
      content: commandErrors.unknownChatError,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await interaction.followUp({
    content: commandResponses.feedbackRecorded,
    flags: MessageFlags.Ephemeral,
  });

  try {
    await interaction.editReply({
      components: [buildFeedbackRow(responseId, askerId, action)],
    });
  } catch (error) {
    logger.warn(`Failed updating feedback buttons\n${String(error)}`, {
      guildId: interaction.guild?.id,
    });
  }
};
