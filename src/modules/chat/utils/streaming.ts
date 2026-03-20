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
    await safeStreamReplyToInteraction(interaction, async (onChunk) => {
      await sendPrompt(options, async (chunk) => {
        await onChunk(chunk);
      });
    });
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
