import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { ChatApiError } from '@/modules/chat/schemas/Credentials.js';
import {
  forgetConversations,
  getUserConversationIds,
} from '@/modules/chat/utils/conversation.js';
import { forgetFeedbackContexts } from '@/modules/chat/utils/feedback.js';
import { resolveInteractionChatUser } from '@/modules/chat/utils/interaction.js';
import {
  conversationPrivacyKey,
  forgetChatUser,
} from '@/modules/chat/utils/privacy.js';
import { deleteChatHistory } from '@/modules/chat/utils/requests.js';
import {
  commandDescriptions,
  commandErrors,
  commandResponseFunctions,
} from '@/translations/commands.js';

export const name = 'forget';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const chatUser = await resolveInteractionChatUser(interaction);
  if (chatUser === null) {
    return;
  }

  try {
    const deleted = await forgetChatUser(
      [
        interaction.user.id,
        ...[...getUserConversationIds(interaction.user.id)].map(
          conversationPrivacyKey,
        ),
      ],
      () => {
        forgetFeedbackContexts(
          interaction.user.id,
          forgetConversations(interaction.user.id),
        );
      },
      () => deleteChatHistory(chatUser.id),
    );
    await interaction.editReply(
      commandResponseFunctions.chatHistoryDeleted(
        deleted.deleted_conversations,
        deleted.deleted_feedback,
      ),
    );
  } catch (error) {
    if (!(error instanceof ChatApiError)) {
      throw error;
    }

    logger.error(`Failed deleting chat history (HTTP ${error.status})`, {
      guildId: interaction.guild?.id,
    });
    await interaction.editReply(commandErrors.chatHistoryDeleteFailed);
  }
};
