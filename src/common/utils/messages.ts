import {
  type ChatInputCommandInteraction,
  codeBlock,
  type Message,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import type { StreamEvent } from '@/common/types/StreamEvent.js';

import { labels, toolStatusLabels } from '@/translations/labels.js';

type EventProducer = (
  emit: (event: StreamEvent) => Promise<void>,
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

type StreamView = {
  answer: string;
  reasoning: string;
  status: null | string;
};

// Wrap a single logical line to `width`, breaking on a space where possible so a
// blockquote line never exceeds the message split window (see formatReasoning).
const wrapLine = (line: string, width: number): string[] => {
  if (line.length <= width) {
    return [line];
  }

  const wrapped: string[] = [];
  let rest = line;
  while (rest.length > width) {
    const space = rest.lastIndexOf(' ', width);
    const cut = space > 0 ? space : width;
    wrapped.push(rest.slice(0, cut));
    rest = rest.slice(space > 0 ? cut + 1 : cut);
  }
  wrapped.push(rest);

  return wrapped;
};

// Leave room for the longest line prefix ("> 🧠 ", 5 UTF-16 units) so a prefixed
// reasoning line stays within MAX_STREAM_LENGTH.
const REASONING_LINE_WIDTH = MAX_STREAM_LENGTH - 6;

// Reasoning streams on a separate channel and renders as a blockquote above the
// answer, so it reads as the model's thinking rather than part of the answer.
// Trimmed so a trailing/leading newline does not emit a stray empty `> ` line,
// and long lines are pre-wrapped so the blockquote prefix survives message
// splitting (a split then always lands on a newline between `> ` lines).
const formatReasoning = (reasoning: string): string =>
  reasoning
    .trim()
    .split('\n')
    .flatMap((line) => wrapLine(line, REASONING_LINE_WIDTH))
    .map((line, index) => (index === 0 ? `> 🧠 ${line}` : `> ${line}`))
    .join('\n');

export const composeStreamView = (view: StreamView): string => {
  const head =
    view.reasoning.trim() === '' ? '' : formatReasoning(view.reasoning);
  // Before answer tokens arrive the lower region shows the status (or nothing);
  // once they stream, the answer takes over that region below the reasoning.
  const tail = view.answer === '' ? (view.status ?? '') : view.answer;

  return [head, tail].filter((part) => part !== '').join('\n\n');
};

export const splitStreamMessage = (text: string): string[] => {
  if (text === '') {
    return [''];
  }

  const messages: string[] = [];
  let rest = text;

  while (rest.length > MAX_STREAM_LENGTH) {
    const [head, tail] = smartSplit(rest, MAX_STREAM_LENGTH);
    messages.push(head);
    rest = tail;
  }

  messages.push(rest);

  return messages;
};

const runStreaming = async (
  produce: EventProducer,
  flush: (index: number, content: string) => Promise<void>,
  prune?: (keepCount: number) => Promise<void>,
) => {
  const view: StreamView = { answer: '', reasoning: '', status: null };
  let lastEdit = Date.now();

  const flushAll = async () => {
    const buffers = splitStreamMessage(composeStreamView(view));
    for (const [index, buffer] of buffers.entries()) {
      await flush(index, buffer);
    }
    // Drop messages left over from a previously longer view (e.g. a pre-tool
    // preamble cleared by `reset`) so stale content does not linger in the channel.
    await prune?.(buffers.length);
  };

  const handleEvent = async (event: StreamEvent) => {
    switch (event.type) {
      case 'done':
        return;
      case 'error':
        view.status = null;
        view.answer =
          view.answer === ''
            ? event.message
            : `${view.answer}\n\n${event.message}`;
        lastEdit = Date.now();
        await flushAll();
        return;
      case 'reset':
        // Drop any pre-tool answer preamble so TTFT tracks the real answer;
        // accumulated reasoning is preserved so it stays above the answer.
        view.answer = '';
        view.status = null;
        return;
      case 'status': {
        const override = event.tool
          ? toolStatusLabels.get(event.tool)
          : undefined;
        view.answer = '';
        view.status = override ?? event.label;
        lastEdit = Date.now();
        await flushAll();
        return;
      }
      case 'thinking': {
        view.status = null;
        view.reasoning += event.text;
        const now = Date.now();
        if (now - lastEdit > 1_000) {
          lastEdit = now;
          await flushAll();
        }
        return;
      }
      case 'token': {
        view.status = null;
        view.answer += event.text;
        const now = Date.now();
        if (now - lastEdit > 1_000) {
          lastEdit = now;
          await flushAll();
        }
      }
    }
  };

  await produce(handleEvent);

  await flushAll();
};

// Delete tracked messages beyond `keepCount` when a streamed view shrinks to
// fewer messages than were already sent. Truncates the caller's array first so
// later flushes recreate from a clean state; deletion is best-effort.
const pruneSurplusMessages = async (
  sentMessages: Message[],
  keepCount: number,
): Promise<void> => {
  const surplus = sentMessages.slice(keepCount);
  if (surplus.length === 0) {
    return;
  }

  sentMessages.length = keepCount;
  for (const surplusMessage of surplus) {
    try {
      await surplusMessage.delete();
    } catch {
      // Best-effort: the follow-up may already be gone.
    }
  }
};

export const safeStreamReplyToInteraction = async (
  interaction: StreamableInteraction,
  produce: EventProducer,
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

  await runStreaming(produce, flush, (keepCount) =>
    pruneSurplusMessages(sentMessages, keepCount),
  );

  return sentMessages;
};

export const safeStreamReplyToMessage = async (
  message: Message,
  produce: EventProducer,
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

  await runStreaming(produce, flush, (keepCount) =>
    pruneSurplusMessages(sentMessages, keepCount),
  );

  return sentMessages;
};
