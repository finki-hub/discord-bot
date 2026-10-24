import type { Message } from 'discord.js';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { StreamEvent } from '@/common/types/StreamEvent.js';

import { safeStreamReplyToMessage } from '@/common/utils/messages.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const fakeMessage = (contents: string[]) => {
  const sent = {
    content: '',
    edit: async (payload: { content: string }) => {
      sent.content = payload.content;
      contents.push(payload.content);
      return sent;
    },
  };
  return {
    reply: async (payload: { content: string }) => {
      sent.content = payload.content;
      contents.push(payload.content);
      return sent;
    },
  } as unknown as Message;
};

test('a tool step skipped by the edit throttle still appears while the search runs', async () => {
  const contents: string[] = [];
  const search = Promise.withResolvers<undefined>();

  const reply = safeStreamReplyToMessage(
    fakeMessage(contents),
    async (emit) => {
      const events: StreamEvent[] = [
        { text: 'Прво ќе проверам.', type: 'token' },
        {
          label: '🔍 Пребарувам…',
          tool: 'search_knowledge_base',
          type: 'status',
        },
        {
          id: 'a',
          label: 'Пребарувам: рок за упис',
          name: 'search_knowledge_base',
          type: 'tool_call',
        },
      ];
      for (const event of events) {
        await emit(event);
      }
      await search.promise;
      await emit({
        id: 'a',
        name: 'search_knowledge_base',
        ok: true,
        summary: '',
        type: 'tool_result',
      });
      await emit({ type: 'done' });
    },
  );

  await vi.advanceTimersByTimeAsync(400);
  expect(contents.at(-1)).toContain('-# 🔎 Пребарувам: рок за упис · ⏳');
  expect(contents.at(-1)).toContain('Прво ќе проверам.');

  search.resolve(undefined);
  await vi.runAllTimersAsync();
  await reply;
  expect(contents.at(-1)).toBe('Прво ќе проверам.\n-# 🔎 1 пребарување');
});
