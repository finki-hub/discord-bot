import {
  ChannelType,
  MessageFlags,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Ticket } from '@/modules/ticket/schemas/Ticket.js';

import { commandErrors } from '@/translations/commands.js';
import { ticketMessageFunctions } from '@/translations/tickets.js';

const mocks = vi.hoisted(() => ({
  createTicket: vi.fn<(...args: unknown[]) => Promise<void>>(),
  findActiveTicket:
    vi.fn<(...args: unknown[]) => Promise<undefined | { url: string }>>(),
  getChannel: vi.fn<(channel: string, guildId: string) => TextChannel>(),
  getMembersByRoleIds:
    vi.fn<(guild: unknown, roleIds: string[]) => Promise<string[]>>(),
  getTicketProperty:
    vi.fn<(id: string, guildId: string) => Promise<Ticket | undefined>>(),
  getTicketingProperty:
    vi.fn<(key: string, guildId: string) => Promise<boolean>>(),
}));

vi.mock('@/common/services/channels.js', () => ({
  getChannel: mocks.getChannel,
}));
vi.mock('@/common/services/roles.js', () => ({
  getMembersByRoleIds: mocks.getMembersByRoleIds,
}));
vi.mock('@/configuration/bot/index.js', () => ({
  getTicketProperty: mocks.getTicketProperty,
  getTicketingProperty: mocks.getTicketingProperty,
}));
vi.mock('@/modules/ticket/utils/tickets.js', () => ({
  createTicket: mocks.createTicket,
  findActiveTicket: mocks.findActiveTicket,
}));

const { execute } =
  await import('@/modules/ticket/commands/modal/ticketCreate.js');

const TICKET: Ticket = {
  id: 'support',
  name: 'Поддршка',
  roles: ['staff-role'],
};

const interactionFor = (description: string) => {
  const deferReply = vi.fn<() => Promise<void>>(async () => {});
  const editReply = vi.fn<(payload: unknown) => Promise<void>>(async () => {});
  const interaction = {
    deferReply,
    editReply,
    fields: {
      getTextInputValue: vi.fn<(field: string) => string>(() => description),
    },
    guild: { id: 'guild' },
    user: { id: 'requester', tag: 'requester#0001' },
  } as unknown as ModalSubmitInteraction;

  return { deferReply, editReply, interaction };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTicketingProperty.mockResolvedValue(true);
  mocks.getTicketProperty.mockResolvedValue(TICKET);
  mocks.getChannel.mockReturnValue({
    type: ChannelType.GuildText,
  } as unknown as TextChannel);
  mocks.findActiveTicket.mockResolvedValue(undefined);
  mocks.getMembersByRoleIds.mockResolvedValue(['staff-member']);
  mocks.createTicket.mockResolvedValue(undefined);
});

describe('ticket create modal', () => {
  test('creates the ticket with the trimmed description and staff members', async () => {
    const { deferReply, editReply, interaction } = interactionFor('  Help  ');

    await execute(interaction, ['support']);

    expect(deferReply).toHaveBeenCalledExactlyOnceWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(mocks.findActiveTicket).toHaveBeenCalledWith(interaction, TICKET);
    expect(mocks.getMembersByRoleIds).toHaveBeenCalledWith(
      interaction.guild,
      TICKET.roles,
    );
    expect(mocks.createTicket).toHaveBeenCalledWith(interaction, TICKET, {
      description: 'Help',
      memberIds: ['staff-member'],
    });
    expect(editReply).not.toHaveBeenCalled();
  });

  test('links an existing ticket without fetching members', async () => {
    const { editReply, interaction } = interactionFor('Help');
    mocks.findActiveTicket.mockResolvedValue({
      url: 'https://discord.com/channels/1/2',
    });

    await execute(interaction, ['support']);

    expect(mocks.getMembersByRoleIds).not.toHaveBeenCalled();
    expect(mocks.createTicket).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      ticketMessageFunctions.ticketExisting('https://discord.com/channels/1/2'),
    );
  });

  test('rejects a whitespace description before fetching members', async () => {
    const { editReply, interaction } = interactionFor(' '.repeat(3));

    await execute(interaction, ['support']);

    expect(mocks.getMembersByRoleIds).not.toHaveBeenCalled();
    expect(mocks.createTicket).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      commandErrors.ticketDescriptionRequired,
    );
  });

  test('rejects a ticket type without staff roles', async () => {
    const { editReply, interaction } = interactionFor('Help');
    mocks.getTicketProperty.mockResolvedValue({ ...TICKET, roles: [] });

    await execute(interaction, ['support']);

    expect(mocks.getMembersByRoleIds).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(commandErrors.noTicketMembers);
  });

  test('rejects a ticket type without role members', async () => {
    const { editReply, interaction } = interactionFor('Help');
    mocks.getMembersByRoleIds.mockResolvedValue([]);

    await execute(interaction, ['support']);

    expect(mocks.createTicket).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(commandErrors.noTicketMembers);
  });

  test('reports disabled ticketing', async () => {
    const { editReply, interaction } = interactionFor('Help');
    mocks.getTicketingProperty.mockResolvedValue(false);

    await execute(interaction, ['support']);

    expect(mocks.getMembersByRoleIds).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(commandErrors.ticketingDisabled);
  });
});
