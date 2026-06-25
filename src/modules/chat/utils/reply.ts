import { type Message } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { safeStreamReplyToMessage } from '@/common/utils/messages.js';
import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandErrors } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { LLM_ERRORS } from './constants.js';
import {
  getConversationHistory,
  registerConversation,
} from './conversation.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import {
  applyStreamEvent,
  hasSavableAnswer,
  sendPrompt,
  type StreamAccumulator,
} from './requests.js';
import { appendTimingFootnote } from './timing.js';

const COMMAND_LABEL = 'chat conversation continuation';

const handleConversationError = async (message: Message, error: unknown) => {
  if (!Error.isError(error)) {
    throw error;
  }

  if (error.message === 'LLM_UNAVAILABLE') {
    logger.warn(`LLM unavailable when executing ${COMMAND_LABEL}`, {
      guildId: message.guild?.id,
    });
  } else {
    const messageParts = [
      `Failed executing ${COMMAND_LABEL}`,
      error.message,
      error.stack,
    ].filter(Boolean);

    logger.error(messageParts.join('\n'), {
      guildId: message.guild?.id,
    });
  }

  const errorMessage =
    LLM_ERRORS[error.message] ?? commandErrors.unknownChatError;

  try {
    await message.reply({
      allowedMentions: { repliedUser: false },
      content: errorMessage,
    });
  } catch {
    // Replying with the error is best-effort; ignore failures.
  }
};

export const handleChatMessage = async (message: Message) => {
  if (message.author.bot) {
    return;
  }

  const inChatThread =
    message.channel.isThread() &&
    getConversationHistory(message.channelId) !== undefined;
  const key = inChatThread ? message.channelId : message.reference?.messageId;
  if (key === undefined) {
    return;
  }

  const history = getConversationHistory(key);
  if (history === undefined) {
    return;
  }

  const prompt = message.content.trim();
  if (prompt.length === 0) {
    return;
  }

  const models =
    message.guild === null
      ? DEFAULT_CONFIGURATION.models
      : await getConfigProperty('models', message.guild.id);

  const options = SendPromptOptionsSchema.parse({
    embeddingsModel: models.embeddings,
    history,
    inferenceModel: models.inference,
    prompt,
  });

  try {
    if (message.channel.isSendable()) {
      await message.channel.sendTyping();
    }
  } catch {
    // The typing indicator is best-effort and must never break the reply.
  }

  try {
    const state: StreamAccumulator = {
      answer: '',
      errored: false,
      firstChunkAt: null,
    };
    const startedAt = Date.now();
    const capture: { responseId: null | string } = { responseId: null };

    const messages = await safeStreamReplyToMessage(message, async (emit) => {
      capture.responseId = await sendPrompt(options, async (event) => {
        applyStreamEvent(state, event);
        await emit(event);
      });
    });

    if (hasSavableAnswer(state)) {
      const messageIds = messages.map((sent) => sent.id);
      registerConversation(inChatThread ? [message.channelId] : messageIds, [
        ...history,
        { content: prompt, role: 'user' },
        { content: state.answer, role: 'assistant' },
      ]);

      await appendTimingFootnote(
        messages.at(-1),
        startedAt,
        state.firstChunkAt,
      );

      const { responseId } = capture;
      if (responseId !== null) {
        rememberFeedbackContext(responseId, {
          answer: state.answer,
          question: prompt,
        });
        await attachFeedbackButtons({
          askerId: message.author.id,
          guildId: message.guild?.id ?? null,
          message: messages.at(-1),
          responseId,
        });
      }
    }
  } catch (error) {
    await handleConversationError(message, error);
  }
};
