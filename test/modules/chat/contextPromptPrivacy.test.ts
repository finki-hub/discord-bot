import {
  type MessageContextMenuCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { describe, expect, test } from 'vitest';

import { execute } from '@/modules/chat/commands/context/prompt.js';

type Call = {
  readonly kind: 'delete' | 'followUp' | 'reply';
  readonly payload: unknown;
};

describe('context prompt privacy', () => {
  test('settles a public deferral before rejecting an empty prompt privately', async () => {
    const calls: Call[] = [];
    const interaction = {
      deferred: true,
      deleteReply: () => {
        calls.push({ kind: 'delete', payload: undefined });
        return Promise.resolve();
      },
      ephemeral: false,
      followUp: (payload: unknown) => {
        calls.push({ kind: 'followUp', payload });
        return Promise.resolve();
      },
      replied: false,
      reply: (payload: unknown) => {
        calls.push({ kind: 'reply', payload });
        return Promise.reject(new Error('InteractionAlreadyReplied'));
      },
      targetMessage: { content: '' },
    } as unknown as MessageContextMenuCommandInteraction;

    await expect(execute(interaction)).resolves.toBeUndefined();

    expect(calls.map(({ kind }) => kind)).toEqual(['delete', 'followUp']);
    expect(calls[1]?.payload).toMatchObject({ flags: MessageFlags.Ephemeral });
  });
});
