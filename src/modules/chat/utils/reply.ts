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
import { sendPrompt } from './requests.js';

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
    let answer = '';

    const messageIds = await safeStreamReplyToMessage(
      message,
      async (onChunk) => {
        await sendPrompt(options, async (chunk) => {
          answer += chunk;
          await onChunk(chunk);
        });
      },
    );

    if (answer.length > 0) {
      registerConversation(inChatThread ? [message.channelId] : messageIds, [
        ...history,
        { content: prompt, role: 'user' },
        { content: answer, role: 'assistant' },
      ]);
    }
  } catch (error) {
    await handleConversationError(message, error);
  }
};
