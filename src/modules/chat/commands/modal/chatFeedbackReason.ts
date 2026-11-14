import { MessageFlags, type ModalSubmitInteraction } from 'discord.js';

import { FeedbackOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import {
  FEEDBACK_COMMENT_FIELD,
  FEEDBACK_REASON_FIELD,
} from '@/modules/chat/utils/feedback.js';
import { sendFeedback } from '@/modules/chat/utils/requests.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

export const name = 'chatFeedbackReason';

// Re-sends the dislike with its reason and note; the API keeps one row per rater.
export const execute = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [responseId] = args;
  const parsed = FeedbackOptionsSchema.safeParse({
    channelId: interaction.channelId ?? undefined,
    client: 'discord',
    comment: interaction.fields.getTextInputValue(FEEDBACK_COMMENT_FIELD),
    feedbackType: 'dislike',
    guildId: interaction.guild?.id,
    reason: interaction.fields.getStringSelectValues(FEEDBACK_REASON_FIELD)[0],
    responseId,
    userId: interaction.user.id,
  });

  if (!parsed.success) {
    await interaction.editReply(commandErrors.commandError);
    return;
  }

  const result = await sendFeedback(parsed.data);

  await interaction.editReply(
    result === 'recorded'
      ? commandResponses.feedbackReasonSaved
      : commandErrors.feedbackUnavailable,
  );
};
