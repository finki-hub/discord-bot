import {
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';

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
import { errorCategory } from '@/common/utils/safeError.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

import type { SendPromptOptions } from '../schemas/Chat.js';

import {
  LLM_ERRORS,
  localizeStreamEvent,
  PRIVATE_STREAM_ERROR_CODES,
} from './constants.js';
import { registerConversation } from './conversation.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import { beginChatOperations, conversationPrivacyKey } from './privacy.js';
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
  const conversationId = randomUUID();
  const finish = beginChatOperations([
    interaction.user.id,
    conversationPrivacyKey(conversationId),
  ]);
  if (finish === null) {
    await safeEphemeralReplyToInteraction(
      interaction,
      commandErrors.llmUnavailable,
    );
    return;
  }
  // Requests rejected before admission (credentials, quota) are never stored.
  let noticePending = false;
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
        capture.responseId = await sendPrompt(
          options,
          conversationId,
          async (event) => {
            await forwardStreamEvent({
              emit,
              ephemeralError,
              event,
              state,
            });
          },
        );
      },
    );

    if (ephemeralError.message !== null) {
      await safeEphemeralReplyToInteraction(
        interaction,
        ephemeralError.message,
      );
      return;
    }

    noticePending = true;
    if (hasSavableAnswer(state)) {
      const messageIds = messages.map((message) => message.id);
      registerConversation(
        messageIds,
        [
          ...options.messages,
          { content: state.answer.slice(0, 2_000), role: 'assistant' },
        ],
        {
          accountId: options.user_id,
          conversationId,
          userId: interaction.user.id,
        },
      );

      noticePending = !(await appendTimingFootnote(messages.at(-1), {
        firstChunkAt: state.firstChunkAt,
        notice: commandResponses.chatStorageNotice,
        startedAt,
      }));

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
          conversationId,
          question: options.messages.at(-1)?.content,
          userId: interaction.user.id,
          userIds: [interaction.user.id],
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
      logger.warn('LLM unavailable when streaming chat response', {
        guildId: interaction.guild?.id,
      });
    } else {
      logger.error(`Failed streaming chat response (${errorCategory(error)})`, {
        guildId: interaction.guild?.id,
      });

      captureException(error, interaction.user.id, {
        command: commandLabel,
        surface: 'interaction',
      });
    }

    const errorMessage =
      LLM_ERRORS[error.message] ?? commandErrors.unknownChatError;
    // A failure after admission can still be stored; credential and quota denials cannot.
    noticePending = !EPHEMERAL_ERROR_CODES.has(error.message);

    await replyStreamError(
      interaction,
      errorMessage,
      EPHEMERAL_ERROR_CODES.has(error.message),
    );
  } finally {
    try {
      if (noticePending) {
        // Also covers empty/error responses and full-length answers. Keep error
        // notices private rather than changing the visibility of the response.
        await interaction.followUp({
          content: commandResponses.chatStorageNotice,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      logger.warn(`Failed sending storage notice (${errorCategory(error)})`, {
        guildId: interaction.guild?.id,
      });
    } finally {
      finish();
    }
  }
};
