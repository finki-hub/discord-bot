import {
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import {
  trackCommandInvoked,
  trackMessageAnswered,
} from '@/common/services/analytics.js';
import { safeStreamReplyToInteraction } from '@/common/utils/messages.js';
import { commandErrors } from '@/translations/commands.js';

import type { SendPromptOptions } from '../schemas/Chat.js';

import { LLM_ERRORS } from './constants.js';
import { registerConversation } from './conversation.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import {
  applyStreamEvent,
  hasSavableAnswer,
  sendPrompt,
  type StreamAccumulator,
} from './requests.js';
import { appendTimingFootnote } from './timing.js';

export const handlePromptWithStreaming = async (
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
  options: SendPromptOptions,
  commandLabel: string,
) => {
  trackCommandInvoked(interaction.user.id, {
    channelId: interaction.channelId,
    command: commandLabel,
    guildId: interaction.guild?.id ?? null,
    surface: 'interaction',
  });

  try {
    const state: StreamAccumulator = {
      answer: '',
      errored: false,
      firstChunkAt: null,
    };
    const startedAt = Date.now();
    const capture: { responseId: null | string } = { responseId: null };

    const messages = await safeStreamReplyToInteraction(
      interaction,
      async (emit) => {
        capture.responseId = await sendPrompt(options, async (event) => {
          applyStreamEvent(state, event);
          await emit(event);
        });
      },
    );

    if (hasSavableAnswer(state)) {
      const messageIds = messages.map((message) => message.id);
      registerConversation(messageIds, [
        ...options.messages,
        { content: state.answer, role: 'assistant' },
      ]);

      await appendTimingFootnote(
        messages.at(-1),
        startedAt,
        state.firstChunkAt,
      );

      const { responseId } = capture;
      if (responseId !== null) {
        trackMessageAnswered(interaction.user.id, {
          channelId: interaction.channelId,
          command: commandLabel,
          guildId: interaction.guild?.id ?? null,
          responseId,
          surface: 'interaction',
        });
        rememberFeedbackContext(responseId, {
          answer: state.answer,
          question: options.messages.at(-1)?.content,
        });
        await attachFeedbackButtons({
          askerId: interaction.user.id,
          guildId: interaction.guild?.id ?? null,
          message: messages.at(-1),
          responseId,
        });
      }
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
