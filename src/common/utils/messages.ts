import {
  type ChatInputCommandInteraction,
  codeBlock,
  type Message,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import type { StreamEvent } from '@/common/types/StreamEvent.js';

import {
  labels,
  toolStatusLabels,
  toolStepLabels,
} from '@/translations/labels.js';

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

export const safeEphemeralReplyToInteraction = async (
  interaction: StreamableInteraction,
  content: string,
): Promise<void> => {
  if (interaction.deferred) {
    if (interaction.ephemeral === true) {
      await interaction.editReply({ content });
      return;
    }

    await interaction.deleteReply();
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
    ephemeral?: boolean;
    language?: string;
    mentionUsers?: boolean;
    useCodeBlock?: boolean;
  },
) => {
  const {
    ephemeral = false,
    language = '',
    mentionUsers = false,
    useCodeBlock = false,
  } = options ?? {};
  const mentionOptions = mentionUsers
    ? {}
    : {
        allowedMentions: {
          users: [],
        },
      };
  const ephemeralOptions = ephemeral
    ? ({ flags: MessageFlags.Ephemeral } as const)
    : {};
  let reply = false;

  for (const output of splitMessage(message)) {
    const nextOutput = output.length === 0 ? labels.none : output;
    const nextReply = useCodeBlock
      ? codeBlock(language, nextOutput)
      : nextOutput;

    if (reply) {
      await interaction.followUp({
        ...mentionOptions,
        ...ephemeralOptions,
        content: nextReply,
      });
    } else if (interaction.deferred) {
      await interaction.editReply({
        ...mentionOptions,
        content: nextReply,
      });
    } else {
      await interaction.reply({
        ...mentionOptions,
        ...ephemeralOptions,
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

  return text[splitIdx] === '\n'
    ? [text.slice(0, splitIdx + 1), text.slice(splitIdx + 1)]
    : [text.slice(0, splitIdx), text.slice(splitIdx + 1)];
};

const MAX_STREAM_LENGTH = 2_000;

type StreamBlock =
  { step: ToolStep; type: 'tool' } | { text: string; type: 'text' };

type StreamView = {
  blocks: StreamBlock[];
  finished: boolean;
  // Text hidden by a pre-tool `status`: restored once a `tool_call` shows the API
  // keeps text across tool calls, discarded by a legacy `reset`.
  hidden: StreamBlock[];
  reasoning: string;
  status: null | string;
  toolMode: boolean;
};

type ToolStep = {
  id: string;
  label: string;
  name: string;
  state: 'done' | 'failed' | 'running';
  summary: string;
};

const SEARCH_TOOL = 'search_knowledge_base';
const TOOL_LINE_LABEL_WIDTH = 160;
const TOOL_STEP_MARKERS = { done: '✅', failed: '⚠️', running: '⏳' } as const;

const textOf = (blocks: StreamBlock[]): string =>
  blocks.map((block) => (block.type === 'text' ? block.text : '')).join('');

const toSubtext = (text: string): string => {
  const line = text.replaceAll(/\s+/gu, ' ').trim();
  return line.length > TOOL_LINE_LABEL_WIDTH
    ? `${line.slice(0, TOOL_LINE_LABEL_WIDTH - 1)}…`
    : line;
};

const formatToolStep = (step: ToolStep): string => {
  const icon = step.name === SEARCH_TOOL ? '🔎' : '🛠️';
  const marker = TOOL_STEP_MARKERS[step.state];
  const summary = step.summary === '' ? '' : ` ${toSubtext(step.summary)}`;
  return `-# ${icon} ${toSubtext(step.label)} · ${marker}${summary}`;
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const summarizeToolSteps = (steps: ToolStep[]): string => {
  if (steps.length === 0) {
    return '';
  }
  const searches = steps.filter((step) => step.name === SEARCH_TOOL).length;
  const tools = steps.length - searches;
  const failed = steps.filter((step) => step.state === 'failed').length;
  const parts = [
    searches > 0 &&
      plural(searches, toolStepLabels.search, toolStepLabels.searchPlural),
    tools > 0 && plural(tools, toolStepLabels.tool, toolStepLabels.toolPlural),
    failed > 0 &&
      `⚠️ ${plural(failed, toolStepLabels.failed, toolStepLabels.failedPlural)}`,
  ].filter((part) => part !== false);
  return `-# ${searches > 0 ? '🔎' : '🛠️'} ${parts.join(' · ')}`;
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

const blockText = (block: StreamBlock): string =>
  block.type === 'text' ? block.text.trim() : '';

// While streaming, tool steps sit inline between the text written around them;
// the finished answer keeps only the text plus a one-line summary at the bottom,
// right above the timing footnote.
const composeToolBody = (view: StreamView): string => {
  if (view.finished) {
    const texts = view.blocks.map(blockText).filter((text) => text !== '');
    const steps = view.blocks
      .filter((block) => block.type === 'tool')
      .map((block) => block.step);
    return [texts.join('\n\n'), summarizeToolSteps(steps)]
      .filter((part) => part !== '')
      .join('\n');
  }

  const lines = view.blocks
    .map((block) =>
      block.type === 'tool' ? formatToolStep(block.step) : blockText(block),
    )
    .filter((line) => line !== '');
  if (view.status !== null) {
    lines.push(`-# ${toSubtext(view.status)}`);
  }
  return lines.join('\n');
};

const composeLegacyBody = (view: StreamView): string => {
  const answer = textOf(view.blocks);
  // Before answer tokens arrive the lower region shows the status (or nothing);
  // once they stream, the answer takes over that region below the reasoning.
  return answer === '' ? (view.status ?? '') : answer;
};

export const composeStreamView = (view: StreamView): string => {
  const head =
    view.reasoning.trim() === '' ? '' : formatReasoning(view.reasoning);
  const tail = view.toolMode ? composeToolBody(view) : composeLegacyBody(view);

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

const appendText = (view: StreamView, text: string) => {
  const last = view.blocks.at(-1);
  if (last?.type === 'text') {
    last.text += text;
    return;
  }
  view.blocks.push({ text, type: 'text' });
};

const findToolStep = (view: StreamView, id: string): ToolStep | undefined => {
  for (const block of view.blocks) {
    if (block.type === 'tool' && block.step.id === id) {
      return block.step;
    }
  }
  return undefined;
};

// `soon` batches bursts of parallel tool calls and their results into one edit.
type FlushMode = 'none' | 'now' | 'soon' | 'throttled';

const applyStatus = (
  view: StreamView,
  event: Extract<StreamEvent, { type: 'status' }>,
): FlushMode => {
  if (view.toolMode) {
    // Tool statuses duplicate the tool_call steps already shown.
    if (event.tool) {
      return 'none';
    }
    view.status = event.label;
    return 'now';
  }

  const override = event.tool ? toolStatusLabels.get(event.tool) : undefined;
  view.hidden.push(...view.blocks);
  view.blocks = [];
  view.status = override ?? event.label;
  return 'now';
};

const applyToolCall = (
  view: StreamView,
  event: Extract<StreamEvent, { type: 'tool_call' }>,
): FlushMode => {
  if (!view.toolMode) {
    view.toolMode = true;
    view.blocks = [...view.hidden, ...view.blocks];
    view.hidden = [];
  }
  view.status = null;
  if (findToolStep(view, event.id) !== undefined) {
    return 'none';
  }
  view.blocks.push({
    step: {
      id: event.id,
      label: event.label,
      name: event.name,
      state: 'running',
      summary: '',
    },
    type: 'tool',
  });
  return 'soon';
};

const applyViewEvent = (view: StreamView, event: StreamEvent): FlushMode => {
  switch (event.type) {
    case 'done':
      return 'none';
    case 'error': {
      view.status = null;
      const last = view.blocks.at(-1);
      if (textOf(view.blocks) !== '' && last?.type === 'text') {
        last.text += `\n\n${event.message}`;
      } else {
        view.blocks.push({ text: event.message, type: 'text' });
      }
      return 'now';
    }
    case 'reset':
      // Drop any pre-tool answer preamble so TTFT tracks the real answer;
      // accumulated reasoning and tool steps are preserved.
      view.blocks = view.blocks.filter((block) => block.type === 'tool');
      view.hidden = [];
      view.status = null;
      return 'none';
    case 'status':
      return applyStatus(view, event);
    case 'thinking':
      view.status = null;
      view.reasoning += event.text;
      return 'throttled';
    case 'token':
      view.status = null;
      appendText(view, event.text);
      return 'throttled';
    case 'tool_call':
      return applyToolCall(view, event);
    case 'tool_result':
      break;
  }

  // Results arrive in any order; match them to their call by id.
  const step = findToolStep(view, event.id);
  if (step === undefined) {
    return 'none';
  }
  step.state = event.ok ? 'done' : 'failed';
  step.summary = event.summary;
  return 'soon';
};

const runStreaming = async (
  produce: EventProducer,
  flush: (index: number, content: string) => Promise<void>,
  prune?: (keepCount: number) => Promise<void>,
) => {
  const view: StreamView = {
    blocks: [],
    finished: false,
    hidden: [],
    reasoning: '',
    status: null,
    toolMode: false,
  };
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
    const mode = applyViewEvent(view, event);
    const now = Date.now();
    const due =
      mode === 'now' ||
      (mode === 'soon' && now - lastEdit > 300) ||
      (mode === 'throttled' && now - lastEdit > 1_000);
    if (!due) {
      return;
    }

    lastEdit = now;
    await flushAll();
  };

  await produce(handleEvent);

  view.finished = true;
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
