import {
  ChannelType,
  Collection,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Ticket } from '@/modules/ticket/schemas/Ticket.js';

const mocks = vi.hoisted(() => ({
  getChannel: vi.fn<(channel: string, guildId: string) => TextChannel>(),
  getChannelsProperty: vi.fn<(channel: string, guildId: string) => string>(),
  getTicketProperty: vi.fn<(id: string, guildId: string) => Ticket>(),
  getTicketingProperty: vi.fn<(property: string, guildId: string) => boolean>(),
}));

vi.mock('@/common/services/channels.js', () => ({
  getChannel: mocks.getChannel,
}));
vi.mock('@/configuration/bot/index.js', () => ({
  getChannelsProperty: mocks.getChannelsProperty,
  getTicketProperty: mocks.getTicketProperty,
  getTicketingProperty: mocks.getTicketingProperty,
}));

const { createTicket } = await import('@/modules/ticket/utils/tickets.js');

const TICKET_TYPE: Ticket = {
  id: 'support',
  name: 'Поддршка',
  roles: ['staff-role'],
};

const interactionFor = (
  guild: Guild,
  editReply: (payload: unknown) => Promise<unknown>,
) =>
  ({
    editReply,
    guild,
    user: {
      displayAvatarURL: () => 'https://example.invalid/avatar.png',
      id: 'requester',
      tag: 'requester#0001',
    },
  }) as unknown as ModalSubmitInteraction;

describe('createTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChannelsProperty.mockReturnValue('tickets-channel');
  });

  test('adds the requester and staff and posts the modal request', async () => {
    const add = vi.fn<(memberId: string) => Promise<void>>(async () => {});
    const send = vi.fn<(payload: unknown) => Promise<unknown>>(
      async () => ({}),
    );
    const thread = {
      id: 'ticket-thread',
      members: { add },
      send,
      url: 'https://discord.com/channels/1/2',
    };
    const create = vi.fn<(options: unknown) => Promise<typeof thread>>(
      async () => thread,
    );
    mocks.getChannel.mockReturnValue({
      threads: { create },
      type: ChannelType.GuildText,
    } as unknown as TextChannel);

    const editReply = vi.fn<(payload: unknown) => Promise<unknown>>(
      async () => ({}),
    );
    const guild = {
      channels: { cache: new Collection() },
      id: 'guild',
    } as unknown as Guild;

    await createTicket(interactionFor(guild, editReply), TICKET_TYPE, {
      description: 'Не можам да го отворам предметот.',
      memberIds: ['staff-member'],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'requester#0001 - Поддршка',
        type: ChannelType.PrivateThread,
      }),
    );
    expect(add.mock.calls).toEqual([['requester'], ['staff-member']]);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        embeds: [expect.anything()],
      }),
    );
    expect(send.mock.calls[2]?.[0]).toBe(
      '<@&staff-role> Креиран е тикет до Вас.',
    );
    expect(editReply).toHaveBeenCalledWith(
      'Креиран е Вашиот тикет: https://discord.com/channels/1/2',
    );
  });

  test('links an existing open ticket instead of creating another', async () => {
    const thread = {
      archived: false,
      id: 'ticket-thread',
      isThread: () => true,
      locked: false,
      name: 'requester#0001 - Поддршка',
      parentId: 'tickets-channel',
      url: 'https://discord.com/channels/1/2',
    };
    const create = vi.fn<(options: unknown) => Promise<unknown>>(
      async () => {},
    );
    mocks.getChannel.mockReturnValue({
      threads: { create },
      type: ChannelType.GuildText,
    } as unknown as TextChannel);

    const editReply = vi.fn<(payload: unknown) => Promise<unknown>>(
      async () => ({}),
    );
    const guild = {
      channels: { cache: new Collection([['ticket-thread', thread]]) },
      id: 'guild',
    } as unknown as Guild;

    await createTicket(interactionFor(guild, editReply), TICKET_TYPE, {
      description: 'Помош',
      memberIds: [],
    });

    expect(create).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      'Веќе имате активен тикет од овој тип: https://discord.com/channels/1/2',
    );
  });
});
