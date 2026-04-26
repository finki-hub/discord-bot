import {
  type ChatInputCommandInteraction,
  codeBlock,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { labels } from '@/translations/labels.js';

const splitMessage = function* (message: string) {
  if (message === '') {
    yield '';

    return;
  }

  const delimiters = ['\n'];
  const length = 1_999;
  let output;
  let index = message.length;
  let split;
  let currentMessage = message;

  while (currentMessage) {
    if (currentMessage.length > length) {
      split = true;
      for (const char of delimiters) {
        index = currentMessage.slice(0, length).lastIndexOf(char) + 1;

        if (index) {
          split = false;
          break;
        }
      }

      if (split) {
        index = length;
      }

      output = currentMessage.slice(0, Math.max(0, index));
      currentMessage = currentMessage.slice(index);
    } else {
      output = currentMessage;
      currentMessage = '';
    }

    yield output;
  }
};

export const safeReplyToInteraction = async (
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
  message: string,
  options?: {
    language?: string;
    mentionUsers?: boolean;
    useCodeBlock?: boolean;
  },
) => {
  const {
    language = '',
    mentionUsers = false,
    useCodeBlock = false,
  } = options ?? {};
  let reply = false;

  for (const output of splitMessage(message)) {
    const nextOutput = output.length === 0 ? labels.none : output;
    const nextReply = useCodeBlock
      ? codeBlock(language, nextOutput)
      : nextOutput;

    if (reply) {
      await interaction.followUp({
        ...(!mentionUsers && {
          allowedMentions: {
            users: [],
          },
        }),
        content: nextReply,
      });
    } else if (interaction.deferred) {
      await interaction.editReply({
        ...(!mentionUsers && {
          allowedMentions: {
            users: [],
          },
        }),
        content: nextReply,
      });
    } else {
      await interaction.reply({
        ...(!mentionUsers && {
          allowedMentions: {
            users: [],
          },
        }),
        content: nextReply,
      });
    }

    reply = true;
  }
};

const smartSplit = (text: string, maxLength: number): [string, string] => {
  if (text.length <= maxLength) return [text, ''];

  let splitIdx = text.lastIndexOf('\n', maxLength);
  if (splitIdx === -1) {
    splitIdx = text.lastIndexOf(' ', maxLength);
  }

  if (splitIdx === -1) {
    splitIdx = maxLength;
    return [text.slice(0, splitIdx), text.slice(splitIdx)];
  }

  if (text[splitIdx] === '\n') {
    return [text.slice(0, splitIdx + 1), text.slice(splitIdx + 1)];
  }

  return [text.slice(0, splitIdx), text.slice(splitIdx + 1)];
};

export const safeStreamReplyToInteraction = async (
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
  onChunk: (callback: (chunk: string) => Promise<void>) => Promise<void>,
  options?: {
    language?: string;
    mentionUsers?: boolean;
    useCodeBlock?: boolean;
  },
) => {
  const {
    language = '',
    mentionUsers = false,
    useCodeBlock = false,
  } = options ?? {};

  const MAX_LENGTH = 2_000;
  const buffers: string[] = [''];
  const streamState = {
    isFirst: true,
    messageIds: [] as string[],
  };

  const formatContent = (text: string) =>
    useCodeBlock ? codeBlock(language, text) : text;
  const setFirstMessageId = (messageId: string) => {
    streamState.messageIds[0] = messageId;
  };
  const setMessageId = (index: number, messageId: string) => {
    streamState.messageIds[index] = messageId;
  };
  const markFirstReplySent = () => {
    streamState.isFirst = false;
  };

  const sendOrEdit = async (index: number, content: string) => {
    if (content.length === 0) {
      return;
    }

    const baseOptions = mentionUsers ? {} : { allowedMentions: { users: [] } };

    if (index === 0) {
      if (streamState.isFirst) {
        if (interaction.deferred) {
          const msg = await interaction.editReply({
            ...baseOptions,
            content: formatContent(content),
          });
          setFirstMessageId(msg.id);
        } else {
          const msg = await interaction.reply({
            ...baseOptions,
            content: formatContent(content),
          });
          setFirstMessageId(msg.id);
        }
        markFirstReplySent();
      } else {
        await interaction.editReply({
          ...baseOptions,
          content: formatContent(content),
        });
      }
    } else if (streamState.messageIds[index]) {
      await interaction.channel?.messages.edit(streamState.messageIds[index], {
        content: formatContent(content),
      });
    } else {
      const msg = await interaction.followUp({
        ...baseOptions,
        content: formatContent(content),
      });
      setMessageId(index, msg.id);
    }
  };

  let lastEdit = Date.now();

  const handleChunk = async (chunk: string) => {
    let bufferIndex = buffers.length - 1;
    buffers[bufferIndex] += chunk;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bufferIndex is derived from buffers.length and always points at an existing entry here
    while (buffers[bufferIndex]!.length > MAX_LENGTH) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bufferIndex is guaranteed to point to the current buffer while splitting
      const [head, tail] = smartSplit(buffers[bufferIndex]!, MAX_LENGTH);
      buffers[bufferIndex] = head;
      buffers.push(tail);
      bufferIndex++;
    }

    const now = Date.now();
    if (now - lastEdit > 1_000) {
      lastEdit = now;
      for (const [i, buffer] of buffers.entries()) {
        await sendOrEdit(i, buffer);
      }
    }
  };

  await onChunk(handleChunk);

  for (const [i, buffer] of buffers.entries()) {
    await sendOrEdit(i, buffer);
  }
};
