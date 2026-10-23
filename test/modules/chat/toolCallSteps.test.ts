import type { ChatInputCommandInteraction, Message } from 'discord.js';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamEvent } from '@/common/types/StreamEvent.js';
import type { SendPromptOptions } from '@/modules/chat/schemas/Chat.js';

import { logger } from '@/common/logger/index.js';
import { registerConversation } from '@/modules/chat/utils/conversation.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import { handleChatMessage } from '@/modules/chat/utils/reply.js';
import {
  applyStreamEvent,
  invalidateModelCatalog,
  sendPrompt,
  type StreamAccumulator,
} from '@/modules/chat/utils/requests.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';

const USER_ID = '00000000-0000-4000-8000-000000000002';
const SEARCH = 'search_knowledge_base';

type Frame = readonly [event: string, data: unknown];

const sse = (frames: readonly Frame[]): string =>
  frames
    .map(
      ([event, data]) =>
        `event: ${event}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
    )
    .join('');

const sseResponse = (frames: readonly Frame[]): Response => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // One chunk per frame so every event is drained (and rendered) on its own.
      for (const frame of frames) {
        controller.enqueue(new TextEncoder().encode(sse([frame])));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'x-response-id': 'response-1',
    },
    status: 200,
  });
};

const installFetchQueue = (responses: Response[]): void => {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const response = queue.shift();
      if (response === undefined) {
        throw new Error('The test exhausted its mocked fetch queue');
      }
      return response;
    }),
  );
};

const streamOptions = {
  embeddings_model: undefined,
  inference_model: undefined,
  interface: 'discord',
  max_tokens: undefined,
  messages: [{ content: 'question', role: 'user' as const }],
  reasoning: undefined,
  temperature: undefined,
  top_p: undefined,
  user_id: USER_ID,
} satisfies SendPromptOptions;

const contentOf = (payload: unknown): null | string =>
  typeof payload === 'object' &&
  payload !== null &&
  'content' in payload &&
  typeof payload.content === 'string'
    ? payload.content
    : null;

// A sent Discord message whose edits are recorded and visible to a re-fetch.
const fakeSentMessage = (id: string, contents: string[], initial: string) => {
  const sent = {
    content: initial,
    edit: async (payload: unknown) => {
      const content = contentOf(payload);
      if (content !== null) {
        sent.content = content;
        contents.push(content);
      }
      return sent;
    },
    fetch: async () => sent,
    id,
  };
  contents.push(initial);
  return sent;
};

const runInteraction = async (frames: readonly Frame[]) => {
  const contents: string[] = [];
  let sent: ReturnType<typeof fakeSentMessage> | undefined;
  const interaction = {
    channelId: 'channel-1',
    deferred: false,
    editReply: async (payload: unknown) => {
      if (sent !== undefined) {
        await sent.edit(payload);
      }
      return sent;
    },
    fetchReply: async () => sent,
    followUp: async () => ({}),
    guild: null,
    replied: false,
    reply: async (payload: unknown) => {
      interaction.replied = true;
      sent = fakeSentMessage(
        'interaction-response-1',
        contents,
        contentOf(payload) ?? '',
      );
    },
    user: { id: 'discord-user-1' },
  };

  installFetchQueue([sseResponse(frames)]);
  await handlePromptWithStreaming(
    interaction as unknown as ChatInputCommandInteraction,
    streamOptions,
    'test interaction',
  );
  return contents;
};

const runMessage = async (frames: readonly Frame[]) => {
  const contents: string[] = [];
  const message = {
    author: {
      avatarURL: () => null,
      bot: false,
      displayName: 'Test User',
      id: 'discord-user-1',
    },
    channel: {
      isSendable: () => true,
      isThread: () => false,
      sendTyping: async () => {},
    },
    channelId: 'channel-1',
    content: 'question',
    guild: null,
    reference: { messageId: 'tool-history-root' },
    reply: async (payload: unknown) =>
      fakeSentMessage('message-response-1', contents, contentOf(payload) ?? ''),
  } as unknown as Message;

  registerConversation(['tool-history-root'], []);
  installFetchQueue([
    Response.json({
      id: USER_ID,
      provider: 'discord',
      provider_subject: 'discord-user-1',
    }),
    Response.json({ models: [], source: 'test', version: 1 }),
    sseResponse(frames),
  ]);
  await handleChatMessage(message);
  return contents;
};

const answerPaths = [
  { name: 'interaction', run: runInteraction },
  { name: 'reply message', run: runMessage },
] as const;

const toolCall = (id: string, query: string): Frame => [
  'tool_call',
  { id, input: { query }, label: `Пребарувам: ${query}`, name: SEARCH },
];

const toolResult = (id: string, ok: boolean, summary: string): Frame => [
  'tool_result',
  { id, name: SEARCH, ok, summary },
];

const token = (text: string): Frame => ['token', { text }];

const toolStatus: Frame = [
  'status',
  { label: 'Пребарувам…', state: 'searching', tool: SEARCH },
];

// The final answer before the timing footnote is appended to it.
const finalBody = (contents: string[]): string | undefined => {
  const last = contents.at(-1) ?? '';
  const footnote = last.indexOf('\n-# ⏱');
  return footnote === -1 ? last : last.slice(0, footnote);
};

describe('tool call stream events', () => {
  const originalLoggerSilent = logger.silent;

  beforeEach(() => {
    logger.silent = true;
    const clock = { now: 0 };
    // Every Date.now() call is two seconds later, so no edit is throttled away.
    vi.spyOn(Date, 'now').mockImplementation(() => {
      clock.now += 2_000;
      return clock.now;
    });
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.example');
    vi.stubEnv('API_KEY', 'test-key');
    invalidateModelCatalog(USER_ID);
    clearChatUserCache('discord-user-1');
  });

  afterEach(() => {
    invalidateModelCatalog(USER_ID);
    clearChatUserCache('discord-user-1');
    logger.silent = originalLoggerSilent;
  });

  test('parses tool events and ignores malformed ones', async () => {
    installFetchQueue([
      sseResponse([
        toolCall('call-1', 'упис'),
        ['tool_call', { label: 'no id', name: SEARCH }],
        ['tool_call', { id: 'call-2' }],
        ['tool_call', 'not json'],
        ['tool_call', { id: 'call-3', name: SEARCH }],
        toolResult('call-1', false, 'Грешка'),
        ['tool_result', { id: 'call-1', ok: 'yes' }],
        ['tool_result', { ok: true }],
      ]),
    ]);
    const events: StreamEvent[] = [];
    await sendPrompt(streamOptions, 'conversation-1', async (event) => {
      events.push(event);
    });

    expect(events).toStrictEqual([
      {
        id: 'call-1',
        label: 'Пребарувам: упис',
        name: SEARCH,
        type: 'tool_call',
      },
      { id: 'call-3', label: SEARCH, name: SEARCH, type: 'tool_call' },
      {
        id: 'call-1',
        name: SEARCH,
        ok: false,
        summary: 'Грешка',
        type: 'tool_result',
      },
    ]);
  });

  test('saves text around tool calls as separate paragraphs', () => {
    const state: StreamAccumulator = {
      answer: '',
      errored: false,
      firstChunkAt: null,
    };

    for (const event of [
      { text: 'Ќе пребарам. ', type: 'token' },
      { id: 'a', label: 'Пребарувам: a', name: SEARCH, type: 'tool_call' },
      { id: 'a', name: SEARCH, ok: true, summary: '', type: 'tool_result' },
      { text: '\n', type: 'token' },
      { text: 'Одговор', type: 'token' },
      { text: ' тука.', type: 'token' },
    ] satisfies StreamEvent[]) {
      applyStreamEvent(state, event);
    }

    expect(state.answer).toBe('Ќе пребарам.\n\nОдговор тука.');
  });

  test('adds no paragraph break when a tool call precedes all text', () => {
    const state: StreamAccumulator = {
      answer: '',
      errored: false,
      firstChunkAt: null,
    };

    for (const event of [
      { id: 'a', label: 'Пребарувам: a', name: SEARCH, type: 'tool_call' },
      { text: 'Одговор', type: 'token' },
      { text: ' тука.', type: 'token' },
    ] satisfies StreamEvent[]) {
      applyStreamEvent(state, event);
    }

    expect(state.answer).toBe('Одговор тука.');
  });

  test.each(answerPaths)(
    'keeps text in order around parallel tool calls on the $name path',
    async ({ run }) => {
      const contents = await run([
        token('Ќе пребарам.'),
        toolStatus,
        toolCall('a', 'префрлување од друг универзитет'),
        toolCall('b', 'запишување втор циклус'),
        toolResult('b', true, 'Пронајдени извори: 4'),
        toolResult('a', false, 'Пребарувањето не успеа'),
        token('Меѓу пребарувања.'),
        toolCall('c', 'рокови'),
        toolStatus,
        toolResult('c', true, ''),
        token('Конечен одговор.'),
        ['done', {}],
      ]);

      expect(contents).toContain(
        [
          'Ќе пребарам.',
          '-# 🔎 Пребарувам: префрлување од друг универзитет · ⏳',
          '-# 🔎 Пребарувам: запишување втор циклус · ⏳',
        ].join('\n'),
      );
      expect(contents).toContain(
        [
          'Ќе пребарам.',
          '-# 🔎 Пребарувам: префрлување од друг универзитет · ⏳',
          '-# 🔎 Пребарувам: запишување втор циклус · ✅ Пронајдени извори: 4',
        ].join('\n'),
      );
      expect(contents).toContain(
        [
          'Ќе пребарам.',
          '-# 🔎 Пребарувам: префрлување од друг универзитет · ⚠️ Пребарувањето не успеа',
          '-# 🔎 Пребарувам: запишување втор циклус · ✅ Пронајдени извори: 4',
          'Меѓу пребарувања.',
          '-# 🔎 Пребарувам: рокови · ✅',
        ].join('\n'),
      );
      // Tool statuses never replace the steps once a tool call has been seen.
      const firstStep = contents.findIndex((content) => content.includes('⏳'));
      expect(firstStep).toBeGreaterThan(0);
      expect(
        contents
          .slice(firstStep)
          .some((content) => content.includes('Пребарувам…')),
      ).toBe(false);
      expect(finalBody(contents)).toBe(
        [
          'Ќе пребарам.\n\nМеѓу пребарувања.\n\nКонечен одговор.',
          '-# 🔎 3 пребарувања · ⚠️ 1 неуспешно',
        ].join('\n'),
      );
    },
  );

  test.each(answerPaths)(
    'restores pre-tool text hidden by an earlier tool status on the $name path',
    async ({ run }) => {
      const contents = await run([
        token('Прво ќе проверам.'),
        toolStatus,
        toolCall('a', 'испити'),
        toolResult('a', true, ''),
        token('Одговор.'),
        ['done', {}],
      ]);

      expect(contents).toContain('Пребарувам…');
      expect(finalBody(contents)).toBe(
        'Прво ќе проверам.\n\nОдговор.\n-# 🔎 1 пребарување',
      );
    },
  );

  test.each(answerPaths)(
    'keeps the legacy status and reset behavior on the $name path',
    async ({ run }) => {
      const contents = await run([
        token('Преамбула'),
        toolStatus,
        ['reset', {}],
        token('Одговор.'),
        ['done', {}],
      ]);

      expect(contents).toContain('Пребарувам…');
      expect(finalBody(contents)).toBe('Одговор.');
      expect(contents.some((content) => content.includes('Преамбула\n'))).toBe(
        false,
      );
    },
  );
});
