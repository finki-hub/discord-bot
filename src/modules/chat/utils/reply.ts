import { type Message } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import {
  captureException,
  trackCommandInvoked,
  trackMessageAnswered,
} from '@/common/services/analytics.js';
import { safeStreamReplyToMessage } from '@/common/utils/messages.js';
import { errorCategory } from '@/common/utils/safeError.js';
import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { ChatApiError } from '../schemas/Credentials.js';
import {
  LLM_ERRORS,
  localizeStreamEvent,
  PRIVATE_STREAM_ERROR_CODES,
} from './constants.js';
import {
  getConversationHistory,
  getConversationId,
  getConversationUsers,
  getPersistenceConversation,
  registerConversation,
  rememberConversationParticipant,
} from './conversation.js';
import { messageDiscordContext } from './discordContext.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import { resolveChatUser } from './identity.js';
import { beginChatOperations, conversationPrivacyKey } from './privacy.js';
import {
  applyStreamEvent,
  getValidatedInferenceModel,
  hasSavableAnswer,
  sendPrompt,
  type StreamAccumulator,
} from './requests.js';
import { appendTimingFootnote } from './timing.js';

const COMMAND_LABEL = 'chat conversation continuation';

// Someone joining another user's reply chain gets their own stored conversation
// but never saw the notice under the original answer.
const appendAnswerFootnote = async ({
  inChatThread,
  lastMessage,
  message,
  persistence,
  timing,
}: {
  inChatThread: boolean;
  lastMessage: Message | undefined;
  message: Message;
  persistence: { markNoticeShown: () => void; noticePending: boolean };
  timing: { firstChunkAt: null | number; startedAt: number };
}) => {
  // Thread members already see the notice in the thread's welcome message.
  if (inChatThread || !persistence.noticePending) {
    await appendTimingFootnote(lastMessage, timing);
    return;
  }

  const notice = commandResponses.chatStorageNotice;
  if (!(await appendTimingFootnote(lastMessage, { ...timing, notice }))) {
    try {
      await message.reply({
        allowedMentions: { repliedUser: false },
        content: `-# ${notice}`,
      });
    } catch {
      // The notice is best-effort; the answer itself was already delivered.
    }
  }
  persistence.markNoticeShown();
};

const finalizeChatAnswer = async (params: {
  askerId: string;
  channelId: string;
  conversationId: string;
  guildId: null | string;
  lastMessage: Message | undefined;
  question: string;
  responseId: null | string;
  state: StreamAccumulator;
  surface: string;
  userIds: string[];
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
      conversationId: params.conversationId,
      question: params.question,
      userId: params.askerId,
      userIds: params.userIds,
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
    logger.error(
      `Failed continuing chat conversation (${errorCategory(error)})`,
      {
        guildId: message.guild?.id,
      },
    );

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
  const conversationId = getConversationId(key);
  if (history === undefined || conversationId === undefined) {
    return;
  }

  const prompt = message.content.trim();
  if (prompt.length === 0) {
    return;
  }

  const surface = inChatThread ? 'thread' : 'reply';
  const finish = beginChatOperations([
    ...getConversationUsers(key),
    message.author.id,
    conversationPrivacyKey(conversationId),
  ]);
  if (finish === null) return;
  rememberConversationParticipant(key, message.author.id);

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
    const persistence = getPersistenceConversation(key, {
      id: chatUser.id,
      userId: message.author.id,
    });
    const inferenceModel = await getValidatedInferenceModel(
      chatUser.id,
      models.inference,
    );
    const options = SendPromptOptionsSchema.parse({
      discordContext: messageDiscordContext(message),
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
      capture.responseId = await sendPrompt(
        options,
        persistence.id,
        async (event) => {
          const localizedEvent = localizeStreamEvent(event);
          const publicEvent =
            localizedEvent.type === 'error' &&
            PRIVATE_STREAM_ERROR_CODES.has(localizedEvent.code)
              ? { ...localizedEvent, message: commandErrors.unknownChatError }
              : localizedEvent;
          applyStreamEvent(state, publicEvent);
          await emit(publicEvent);
        },
      );
    });

    if (hasSavableAnswer(state)) {
      const messageIds = messages.map((sent) => sent.id);
      registerConversation(
        inChatThread ? [message.channelId] : messageIds,
        [
          ...history,
          { content: prompt, role: 'user' },
          { content: state.answer.slice(0, 2_000), role: 'assistant' },
        ],
        persistence.session,
      );

      await appendAnswerFootnote({
        inChatThread,
        lastMessage: messages.at(-1),
        message,
        persistence,
        timing: { firstChunkAt: state.firstChunkAt, startedAt },
      });

      await finalizeChatAnswer({
        askerId: message.author.id,
        channelId: message.channelId,
        conversationId,
        guildId: message.guild?.id ?? null,
        lastMessage: messages.at(-1),
        question: prompt,
        responseId: capture.responseId,
        state,
        surface,
        userIds: [
          ...(persistence.session.participants ?? []),
          message.author.id,
        ],
      });
    }
  } catch (error) {
    await handleConversationError(message, error, surface);
  } finally {
    finish();
  }
};
