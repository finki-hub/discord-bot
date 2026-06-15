import {
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { safeStreamReplyToInteraction } from '@/common/utils/messages.js';
import { commandErrors } from '@/translations/commands.js';

import type { SendPromptOptions } from '../schemas/Chat.js';

import { LLM_ERRORS } from './constants.js';
import { registerConversation } from './conversation.js';
import { sendPrompt } from './requests.js';

export const handlePromptWithStreaming = async (
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
  options: SendPromptOptions,
  commandLabel: string,
) => {
  try {
    let answer = '';

    const messageIds = await safeStreamReplyToInteraction(
      interaction,
      async (onChunk) => {
        await sendPrompt(options, async (chunk) => {
          answer += chunk;
          await onChunk(chunk);
        });
      },
    );

    if (answer.length > 0) {
      registerConversation(messageIds, [
        ...options.messages,
        { content: answer, role: 'assistant' },
      ]);
    }
  } catch (error) {
    if (!Error.isError(error)) {
      throw error;
    }

    if (error.message === 'LLM_UNAVAILABLE') {
      logger.warn(`LLM unavailable when executing ${commandLabel}`, {
        guildId: interaction.guild?.id,
      });
    } else {
      const messageParts = [
        `Failed executing ${commandLabel}`,
        error.message,
        error.stack,
      ].filter(Boolean);

      logger.error(messageParts.join('\n'), {
        guildId: interaction.guild?.id,
      });
    }

    const errorMessage =
      LLM_ERRORS[error.message] ?? commandErrors.unknownChatError;

    await (interaction.deferred || interaction.replied
      ? interaction.editReply(errorMessage)
      : interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        }));
  }
};
