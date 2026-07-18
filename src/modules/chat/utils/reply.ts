import { type Message } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import {
  captureException,
  trackCommandInvoked,
  trackMessageAnswered,
} from '@/common/services/analytics.js';
import { safeStreamReplyToMessage } from '@/common/utils/messages.js';
import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandErrors } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { ChatApiError } from '../schemas/Credentials.js';
import { LLM_ERRORS, localizeStreamEvent } from './constants.js';
import {
  getConversationHistory,
  registerConversation,
} from './conversation.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import { resolveChatUser } from './identity.js';
import {
  applyStreamEvent,
  getValidatedInferenceModel,
  hasSavableAnswer,
  sendPrompt,
  type StreamAccumulator,
} from './requests.js';
import { appendTimingFootnote } from './timing.js';

const COMMAND_LABEL = 'chat conversation continuation';

const finalizeChatAnswer = async (params: {
  askerId: string;
  channelId: string;
  guildId: null | string;
  lastMessage: Message | undefined;
  question: string;
  responseId: null | string;
  state: StreamAccumulator;
  surface: string;
}) => {
  const { responseId } = params;

  if (responseId !== null) {
    trackMessageAnswered(params.askerId, {
      channelId: params.channelId,
      command: COMMAND_LABEL,
      guildId: params.guildId,
      responseId,
      surface: params.surface,
    });
    rememberFeedbackContext(responseId, {
      answer: params.state.answer,
      question: params.question,
    });
  }

  await attachFeedbackButtons({
    askerId: params.askerId,
    guildId: params.guildId,
    message: params.lastMessage,
    responseId,
  });
};

const handleConversationError = async (
  message: Message,
  error: unknown,
  surface: string,
) => {
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

    captureException(error, message.author.id, {
      command: COMMAND_LABEL,
      surface,
    });
  }

  const errorMessage =
    error instanceof ChatApiError
      ? commandErrors.llmUnavailable
      : (LLM_ERRORS[error.message] ?? commandErrors.unknownChatError);

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

  const surface = inChatThread ? 'thread' : 'reply';

  trackCommandInvoked(message.author.id, {
    channelId: message.channelId,
    command: COMMAND_LABEL,
    guildId: message.guild?.id ?? null,
    surface,
  });

  try {
    const models =
      message.guild === null
        ? DEFAULT_CONFIGURATION.models
        : await getConfigProperty('models', message.guild.id);
    const chatUser = await resolveChatUser(message.author);
    const inferenceModel = await getValidatedInferenceModel(
      chatUser.id,
      models.inference,
    );
    const options = SendPromptOptionsSchema.parse({
      embeddingsModel: models.embeddings,
      history,
      inferenceModel,
      prompt,
      userId: chatUser.id,
    });

    try {
      if (message.channel.isSendable()) {
        await message.channel.sendTyping();
      }
    } catch {
      // The typing indicator is best-effort and must never break the reply.
    }

    const state: StreamAccumulator = {
      answer: '',
      errored: false,
      firstChunkAt: null,
    };
    const startedAt = Date.now();
    const capture: { responseId: null | string } = { responseId: null };

    const messages = await safeStreamReplyToMessage(message, async (emit) => {
      capture.responseId = await sendPrompt(options, async (event) => {
        const localizedEvent = localizeStreamEvent(event);
        applyStreamEvent(state, localizedEvent);
        await emit(localizedEvent);
      });
    });

    if (hasSavableAnswer(state)) {
      const messageIds = messages.map((sent) => sent.id);
      registerConversation(inChatThread ? [message.channelId] : messageIds, [
        ...history,
        { content: prompt, role: 'user' },
        { content: state.answer.slice(0, 2_000), role: 'assistant' },
      ]);

      await appendTimingFootnote(
        messages.at(-1),
        startedAt,
        state.firstChunkAt,
      );

      await finalizeChatAnswer({
        askerId: message.author.id,
        channelId: message.channelId,
        guildId: message.guild?.id ?? null,
        lastMessage: messages.at(-1),
        question: prompt,
        responseId: capture.responseId,
        state,
        surface,
      });
    }
  } catch (error) {
    await handleConversationError(message, error, surface);
  }
};
