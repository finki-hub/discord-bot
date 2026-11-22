import { type ButtonInteraction, MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { commandResponses } from '@/translations/commands.js';
import { ticketMessages } from '@/translations/tickets.js';

const mocks = vi.hoisted(() => ({
  closeTicket:
    vi.fn<
      (ticketId: string, guildId: string, closedBy?: string) => Promise<void>
    >(),
}));

vi.mock('@/modules/ticket/utils/tickets.js', () => ({
  closeTicket: mocks.closeTicket,
}));

const { execute } =
  await import('@/modules/ticket/commands/button/ticketClose.js');

const interactionFor = () => {
  const deferUpdate = vi.fn<() => Promise<void>>(async () => {});
  const editReply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const reply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const interaction = {
    deferUpdate,
    editReply,
    guild: { id: 'guild' },
    reply,
    user: { id: 'closer' },
  } as unknown as ButtonInteraction;

  return { deferUpdate, editReply, interaction, reply };
};

describe('ticket close button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.closeTicket.mockResolvedValue(undefined);
  });

  test('asks for confirmation before closing', async () => {
    const { interaction, reply } = interactionFor();

    await execute(interaction, ['ticket']);

    expect(mocks.closeTicket).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledOnce();
    expect(reply.mock.calls[0]?.[0]).toMatchObject({
      content: ticketMessages.ticketCloseConfirm,
      flags: MessageFlags.Ephemeral,
    });
  });

  test('closes the ticket once confirmed', async () => {
    const { deferUpdate, editReply, interaction } = interactionFor();

    await execute(interaction, ['ticket', 'confirm']);

    expect(deferUpdate).toHaveBeenCalledOnce();
    expect(mocks.closeTicket).toHaveBeenCalledExactlyOnceWith(
      'ticket',
      'guild',
      'closer',
    );
    expect(editReply).toHaveBeenCalledExactlyOnceWith({
      components: [],
      content: commandResponses.ticketClosed,
    });
  });
});
