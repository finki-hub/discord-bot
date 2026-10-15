import type { Message } from 'discord.js';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { appendTimingFootnote } from '@/modules/chat/utils/timing.js';
import { commandResponses } from '@/translations/commands.js';

vi.mock('@/common/logger/index.js', () => ({
  logger: { warn: vi.fn<() => void>() },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

const options = {
  firstChunkAt: null,
  startedAt: 0,
  notice: commandResponses.chatStorageNotice,
};
const footnote = `\n-# ⏱ 0ms\n-# ${commandResponses.chatStorageNotice}`;

test.each([0, 1])(
  'notice boundary overflow=%s never truncates the answer',
  async (overflow) => {
    const content = 'a'.repeat(2_000 - footnote.length + overflow);
    const edit = vi.fn<(value: { content: string }) => Promise<void>>(
      async () => {},
    );
    const message = {
      fetch: async () => ({ content, edit }),
    } as unknown as Message;
    await expect(appendTimingFootnote(message, options)).resolves.toBe(
      overflow === 0,
    );
    expect(edit.mock.calls).toEqual(
      overflow === 0 ? [[{ content: content + footnote }]] : [],
    );
  },
);

test('missing messages and failed edits request fallback instead of throwing', async () => {
  await expect(appendTimingFootnote(undefined, options)).resolves.toBe(false);
  const message = {
    fetch: async () => {
      throw new Error('unavailable');
    },
  } as unknown as Message;
  await expect(appendTimingFootnote(message, options)).resolves.toBe(false);
});
