import {
  type ChatInputCommandInteraction,
  type Message,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { safeStreamReplyToInteraction } from '@/common/utils/messages.js';
import { commandErrors } from '@/translations/commands.js';
import { labels } from '@/translations/labels.js';

import type { SendPromptOptions } from '../schemas/Chat.js';

import { LLM_ERRORS } from './constants.js';
import { registerConversation } from './conversation.js';
import { attachFeedbackButtons, rememberFeedbackContext } from './feedback.js';
import { sendPrompt } from './requests.js';

const MAX_MESSAGE_LENGTH = 2_000;

const formatDuration = (ms: number) =>
  ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${Math.round(ms)}ms`;

const appendTimingFootnote = async (
  message: Message | undefined,
  startedAt: number,
  firstChunkAt: null | number,
) => {
  if (message === undefined) {
    return;
  }

  const total = formatDuration(Date.now() - startedAt);
  const ttft =
    firstChunkAt === null ? null : formatDuration(firstChunkAt - startedAt);
  const footnote =
    ttft === null
      ? `\n-# ⏱ ${total}`
      : `\n-# ⏱ ${total} · ${labels.firstToken} ${ttft}`;

  if (message.content.length + footnote.length > MAX_MESSAGE_LENGTH) {
    return;
  }

  try {
    await message.edit({ content: message.content + footnote });
  } catch (error) {
    logger.warn(`Failed appending timing footnote\n${String(error)}`, {
      guildId: message.guildId ?? undefined,
    });
  }
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
    let answer = '';
    let firstChunkAt: null | number = null;
    const startedAt = Date.now();
    const capture: { responseId: null | string } = { responseId: null };

    const messages = await safeStreamReplyToInteraction(
      interaction,
      async (onChunk) => {
        capture.responseId = await sendPrompt(options, async (chunk) => {
          firstChunkAt ??= Date.now();
          answer += chunk;
          await onChunk(chunk);
        });
      },
    );

    if (answer.length > 0) {
      const messageIds = messages.map((message) => message.id);
      registerConversation(messageIds, [
        ...options.messages,
        { content: answer, role: 'assistant' },
      ]);

      await appendTimingFootnote(messages.at(-1), startedAt, firstChunkAt);

      const { responseId } = capture;
      if (responseId !== null) {
        rememberFeedbackContext(responseId, {
          answer,
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
