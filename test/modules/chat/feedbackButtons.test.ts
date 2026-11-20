import type { Message, MessageEditOptions } from 'discord.js';

import { expect, test, vi } from 'vitest';

import { attachFeedbackButtons } from '@/modules/chat/utils/feedback.js';

test('edits ephemeral answers through the supplied edit', async () => {
  const message = {} as Message;
  const edit = vi.fn<
    (target: Message, options: MessageEditOptions) => Promise<void>
  >(async () => {});

  await attachFeedbackButtons({
    askerId: 'asker',
    edit,
    guildId: null,
    message,
    responseId: 'response',
  });

  expect(edit).toHaveBeenCalledOnce();
  const [target, options] = edit.mock.calls[0] ?? [];
  expect(target).toBe(message);
  expect(options?.components).toHaveLength(1);
});
