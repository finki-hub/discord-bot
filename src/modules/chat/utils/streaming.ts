import {
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import type { StreamEvent } from '@/common/types/StreamEvent.js';

import { logger } from '@/common/logger/index.js';
import {
  captureException,
  trackMessageAnswered,
} from '@/common/services/analytics.js';
import {
  safeEphemeralReplyToInteraction,
  safeStreamReplyToInteraction,
} from '@/common/utils/messages.js';
import { commandErrors } from '@/translations/commands.js';

import type { SendPromptOptions } from '../schemas/Chat.js';

import {
  LLM_ERRORS,
  localizeStreamEvent,
  PRIVATE_STREAM_ERROR_CODES,
} from './constants.js';
import { registerConversation } from './conversation.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import {
  applyStreamEvent,
  hasSavableAnswer,
  sendPrompt,
  type StreamAccumulator,
} from './requests.js';
import { appendTimingFootnote } from './timing.js';

const EPHEMERAL_ERROR_CODES = new Set([
  ...PRIVATE_STREAM_ERROR_CODES,
  'LLM_DISABLED',
  'LLM_NOT_READY',
  'LLM_UNAVAILABLE',
]);

type StreamableInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

type StreamEventContext = {
  readonly emit: (event: StreamEvent) => Promise<void>;
  readonly ephemeralError: { message: null | string };
  readonly event: StreamEvent;
  readonly state: StreamAccumulator;
};

const forwardStreamEvent = async ({
  emit,
  ephemeralError,
  event,
  state,
}: StreamEventContext): Promise<void> => {
  const localizedEvent = localizeStreamEvent(event);

  if (
    localizedEvent.type === 'error' &&
    EPHEMERAL_ERROR_CODES.has(localizedEvent.code)
  ) {
    applyStreamEvent(state, localizedEvent);
    ephemeralError.message = localizedEvent.message;
    await emit({ type: 'reset' });
    return;
  }

  applyStreamEvent(state, localizedEvent);
  await emit(localizedEvent);
};

const replyStreamError = async (
  interaction: StreamableInteraction,
  errorMessage: string,
  ephemeral: boolean,
): Promise<void> => {
  if (ephemeral) {
    await safeEphemeralReplyToInteraction(interaction, errorMessage);
    return;
  }

  await (interaction.deferred || interaction.replied
    ? interaction.editReply(errorMessage)
    : interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      }));
};

export const handlePromptWithStreaming = async (
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
  options: SendPromptOptions,
  commandLabel: string,
) => {
  try {
    const state: StreamAccumulator = {
      answer: '',
      errored: false,
      firstChunkAt: null,
    };
    const startedAt = Date.now();
    const capture: { responseId: null | string } = { responseId: null };
    const ephemeralError: { message: null | string } = { message: null };

    const messages = await safeStreamReplyToInteraction(
      interaction,
      async (emit) => {
        capture.responseId = await sendPrompt(options, async (event) => {
          await forwardStreamEvent({
            emit,
            ephemeralError,
            event,
            state,
          });
        });
      },
    );

    if (ephemeralError.message !== null) {
      await safeEphemeralReplyToInteraction(
        interaction,
        ephemeralError.message,
      );
      return;
    }

    if (hasSavableAnswer(state)) {
      const messageIds = messages.map((message) => message.id);
      registerConversation(messageIds, [
        ...options.messages,
        { content: state.answer.slice(0, 2_000), role: 'assistant' },
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

      captureException(error, interaction.user.id, {
        command: commandLabel,
        surface: 'interaction',
      });
    }

    const errorMessage =
      LLM_ERRORS[error.message] ?? commandErrors.unknownChatError;

    await replyStreamError(
      interaction,
      errorMessage,
      EPHEMERAL_ERROR_CODES.has(error.message),
    );
  }
};
