import { type ButtonInteraction, MessageFlags } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { errorCategory } from '@/common/utils/safeError.js';
import { FeedbackOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import {
  buildFeedbackRow,
  getFeedbackContext,
  isFeedbackEnabled,
} from '@/modules/chat/utils/feedback.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import {
  beginChatOperations,
  conversationPrivacyKey,
} from '@/modules/chat/utils/privacy.js';
import { sendFeedback } from '@/modules/chat/utils/requests.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

export const name = 'chatFeedback';

const recordFeedback = async (
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

  try {
    // The API only accepts ratings from registered accounts; this is cached.
    await resolveChatUser(interaction.user, AbortSignal.timeout(3_000));
  } catch (error) {
    logger.warn(`Failed registering feedback rater (${errorCategory(error)})`);
    await interaction.followUp({
      content: commandErrors.feedbackUnavailable,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const options = FeedbackOptionsSchema.parse({
    channelId: interaction.channelId,
    client: 'discord',
    clientRef: interaction.message.id,
    feedbackType: action,
    guildId: interaction.guild?.id,
    responseId,
    userId: interaction.user.id,
  });

  const result = await sendFeedback(options);
  if (result !== 'recorded') {
    await interaction.followUp({
      content:
        result === 'unavailable'
          ? commandErrors.feedbackUnavailable
          : commandErrors.unknownChatError,
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

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const context = getFeedbackContext(args[1] ?? '');
  const finish = beginChatOperations([
    ...(context?.userIds ?? []),
    interaction.user.id,
    ...(context?.conversationId === undefined
      ? []
      : [conversationPrivacyKey(context.conversationId)]),
  ]);
  if (finish === null) {
    await interaction.reply({
      content: commandErrors.llmUnavailable,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  try {
    await recordFeedback(interaction, args);
  } finally {
    finish();
  }
};
