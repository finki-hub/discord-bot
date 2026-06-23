import {
  type ChatInputCommandInteraction,
  codeBlock,
  type Message,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { labels } from '@/translations/labels.js';

type ChunkProducer = (
  callback: (chunk: string) => Promise<void>,
) => Promise<void>;

type StreamableInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

type StreamReplyOptions = {
  language?: string;
  mentionUsers?: boolean;
  useCodeBlock?: boolean;
};

const splitMessage = function* (message: string) {
  if (message === '') {
    yield '';

    return;
  }

  const delimiters = ['\n'];
  const length = 1_999;

  const findSplitIndex = (text: string) => {
    for (const char of delimiters) {
      const delimiterIndex = text.slice(0, length).lastIndexOf(char) + 1;

      if (delimiterIndex) {
        return delimiterIndex;
      }
    }

    return length;
  };

  let output;
  let currentMessage = message;

  while (currentMessage) {
    if (currentMessage.length > length) {
      const index = findSplitIndex(currentMessage);

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

const MAX_STREAM_LENGTH = 2_000;

const runStreaming = async (
  produce: ChunkProducer,
  flush: (index: number, content: string) => Promise<void>,
) => {
  const buffers: string[] = [''];
  let lastEdit = Date.now();

  const handleChunk = async (chunk: string) => {
    let bufferIndex = buffers.length - 1;
    buffers[bufferIndex] += chunk;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bufferIndex is derived from buffers.length and always points at an existing entry here
    while (buffers[bufferIndex]!.length > MAX_STREAM_LENGTH) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bufferIndex is guaranteed to point to the current buffer while splitting
      const [head, tail] = smartSplit(buffers[bufferIndex]!, MAX_STREAM_LENGTH);
      buffers[bufferIndex] = head;
      buffers.push(tail);
      bufferIndex++;
    }

    const now = Date.now();
    if (now - lastEdit > 1_000) {
      lastEdit = now;
      for (const [index, buffer] of buffers.entries()) {
        await flush(index, buffer);
      }
    }
  };

  await produce(handleChunk);

  for (const [index, buffer] of buffers.entries()) {
    await flush(index, buffer);
  }
};

export const safeStreamReplyToInteraction = async (
  interaction: StreamableInteraction,
  produce: ChunkProducer,
  options?: StreamReplyOptions,
): Promise<Message[]> => {
  const {
    language = '',
    mentionUsers = false,
    useCodeBlock = false,
  } = options ?? {};

  const baseOptions = mentionUsers ? {} : { allowedMentions: { users: [] } };
  const formatContent = (text: string) =>
    useCodeBlock ? codeBlock(language, text) : text;

  const sentMessages: Message[] = [];

  // Assignments go through these synchronous setters so the streaming awaits in
  // `flush` do not trip the require-atomic-updates rule.
  const rememberReply = (sent: Message) => {
    sentMessages[0] = sent;
  };
  const rememberFollowUp = (index: number, sent: Message) => {
    sentMessages[index] = sent;
  };

  const flush = async (index: number, content: string) => {
    if (content.length === 0) {
      return;
    }

    if (index === 0) {
      if (sentMessages[0] === undefined) {
        const sendReply = async () => {
          if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
              ...baseOptions,
              content: formatContent(content),
            });
          }

          await interaction.reply({
            ...baseOptions,
            content: formatContent(content),
          });

          return interaction.fetchReply();
        };

        const first = await sendReply();
        rememberReply(first);
      } else {
        await interaction.editReply({
          ...baseOptions,
          content: formatContent(content),
        });
      }

      return;
    }

    const existing = sentMessages[index];
    if (existing !== undefined) {
      await existing.edit({ content: formatContent(content) });

      return;
    }

    const sent = await interaction.followUp({
      ...baseOptions,
      content: formatContent(content),
    });
    rememberFollowUp(index, sent);
  };

  await runStreaming(produce, flush);

  return sentMessages;
};

export const safeStreamReplyToMessage = async (
  message: Message,
  produce: ChunkProducer,
  options?: StreamReplyOptions,
): Promise<Message[]> => {
  const {
    language = '',
    mentionUsers = false,
    useCodeBlock = false,
  } = options ?? {};

  const baseOptions = {
    allowedMentions: {
      repliedUser: false,
      ...(!mentionUsers && { users: [] }),
    },
  };
  const formatContent = (text: string) =>
    useCodeBlock ? codeBlock(language, text) : text;

  const sentMessages: Message[] = [];

  const remember = (index: number, sent: Message) => {
    sentMessages[index] = sent;
  };

  const flush = async (index: number, content: string) => {
    if (content.length === 0) {
      return;
    }

    const existing = sentMessages[index];
    if (existing !== undefined) {
      await existing.edit({ content: formatContent(content) });

      return;
    }

    const sent = await message.reply({
      ...baseOptions,
      content: formatContent(content),
    });
    remember(index, sent);
  };

  await runStreaming(produce, flush);

  return sentMessages;
};
