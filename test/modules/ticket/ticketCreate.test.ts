import {
  ChannelType,
  Collection,
  type Guild,
  type Message,
  type ModalSubmitInteraction,
  type TextChannel,
} from 'discord.js';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { Ticket } from '@/modules/ticket/schemas/Ticket.js';

import { logger } from '@/common/logger/index.js';
import { commandErrors } from '@/translations/commands.js';
import { ticketMessageFunctions } from '@/translations/tickets.js';

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

const { createTicket, handleTicketMessage } =
  await import('@/modules/ticket/utils/tickets.js');

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
    guild: { members: { me: null }, ...(guild as object) },
    user: {
      displayAvatarURL: () => 'https://example.invalid/avatar.png',
      id: 'requester',
      tag: 'requester#0001',
    },
  }) as unknown as ModalSubmitInteraction;

const createTicketForExistingTicket = async (
  threadName: string,
  title: string,
) => {
  const thread = {
    archived: false,
    id: 'ticket-thread',
    isThread: () => true,
    locked: false,
    name: threadName,
    parentId: 'tickets-channel',
    url: 'https://discord.com/channels/1/2',
  };
  const create = vi.fn<(options: unknown) => Promise<unknown>>(async () => {});
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
    title,
  });

  return { create, editReply };
};

describe('createTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChannelsProperty.mockReturnValue('tickets-channel');
  });

  test('posts the request as text and lets mentions add members', async () => {
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
      title: 'Проблем со предметот',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Проблем со предметот - requester#0001 - Поддршка',
        type: ChannelType.PrivateThread,
      }),
    );
    expect(add).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toEqual({
      allowedMentions: {
        parse: [],
        roles: ['staff-role'],
        users: ['requester'],
      },
      content: ticketMessageFunctions.ticketRequestHeader(
        'Проблем со предметот',
        'requester',
        '<@&staff-role>',
      ),
    });
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      allowedMentions: { parse: [] },
      content: 'Не можам да го отворам предметот.',
    });
    expect(send.mock.calls[1]?.[0]).toHaveProperty('components');
    expect(send.mock.calls[1]?.[0]).not.toHaveProperty('embeds');
    expect(editReply).toHaveBeenCalledWith(
      'Креиран е Вашиот тикет: https://discord.com/channels/1/2',
    );
  });
});

describe('ticket safeguards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChannelsProperty.mockReturnValue('tickets-channel');
  });

  test('recognizes a text header without resolved role mentions', async () => {
    const header = {
      author: { bot: true },
      content: ticketMessageFunctions.ticketRequestHeader(
        'Наслов',
        'requester',
        '<@&staff-role>',
      ),
      embeds: [],
      mentions: { roles: new Collection() },
      system: false,
    };
    const send = vi.fn<(payload: unknown) => Promise<unknown>>(
      async () => ({}),
    );
    const message = {
      author: { bot: false },
      channel: {
        id: 'ticket-thread',
        isThread: () => true,
        messages: { fetch: async () => new Collection([['header', header]]) },
        parentId: 'tickets-channel',
        send,
      },
      guild: { id: 'guild' },
      id: 'reply',
      system: false,
    } as unknown as Message;

    await handleTicketMessage(message);

    expect(send).not.toHaveBeenCalled();
  });

  test('warns when a ticket role cannot be mentioned', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const thread = {
      id: 'ticket-thread',
      send: vi.fn<() => Promise<unknown>>(async () => ({})),
      url: 'https://discord.com/channels/1/2',
    };
    mocks.getChannel.mockReturnValue({
      threads: { create: async () => thread },
      type: ChannelType.GuildText,
    } as unknown as TextChannel);
    const guild = {
      channels: { cache: new Collection() },
      id: 'guild',
      members: {
        me: { permissionsIn: () => ({ has: () => false }) },
      },
      roles: {
        cache: new Collection([['staff-role', { mentionable: false }]]),
      },
    } as unknown as Guild;

    await createTicket(
      interactionFor(guild, async () => ({})),
      TICKET_TYPE,
      { description: 'Опис', title: 'Наслов' },
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('staff-role'),
      { guildId: 'guild' },
    );
    warn.mockRestore();
  });

  test('deletes the thread when its messages cannot be sent', async () => {
    const deleteThread = vi.fn<() => Promise<void>>(async () => {});
    const failure = new Error('send failed');
    const thread = {
      delete: deleteThread,
      id: 'ticket-thread',
      send: vi.fn<() => Promise<never>>(async () => {
        throw failure;
      }),
      url: 'https://discord.com/channels/1/2',
    };
    mocks.getChannel.mockReturnValue({
      threads: { create: async () => thread },
      type: ChannelType.GuildText,
    } as unknown as TextChannel);
    const editReply = vi.fn<(payload: unknown) => Promise<unknown>>(
      async () => ({}),
    );
    const guild = {
      channels: { cache: new Collection() },
      id: 'guild',
    } as unknown as Guild;

    await expect(
      createTicket(interactionFor(guild, editReply), TICKET_TYPE, {
        description: 'Опис',
        title: 'Наслов',
      }),
    ).rejects.toBe(failure);

    expect(deleteThread).toHaveBeenCalledOnce();
    expect(editReply).not.toHaveBeenCalled();
  });

  test('creates one ticket for concurrent submissions', async () => {
    const send = vi.fn<(payload: unknown) => Promise<unknown>>(
      async () => ({}),
    );
    const thread = {
      id: 'ticket-thread',
      send,
      url: 'https://discord.com/channels/1/2',
    };
    const create = vi.fn<() => Promise<typeof thread>>(async () => thread);
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
    const interaction = interactionFor(guild, editReply);
    const options = { description: 'Опис', title: 'Наслов' };

    await Promise.all([
      createTicket(interaction, TICKET_TYPE, options),
      createTicket(interaction, TICKET_TYPE, options),
    ]);

    expect(create).toHaveBeenCalledOnce();
    expect(editReply).toHaveBeenCalledWith(
      commandErrors.ticketCreationInProgress,
    );
  });

  test("rejects thread names whose metadata cannot fit Discord's limit", async () => {
    const create = vi.fn<(options: unknown) => Promise<unknown>>(
      async () => ({}),
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
    const longType: Ticket = {
      ...TICKET_TYPE,
      name: 'Т'.repeat(100),
    };

    await expect(
      createTicket(interactionFor(guild, editReply), longType, {
        description: 'Опис',
        title: 'Наслов',
      }),
    ).rejects.toThrow('Ticket thread metadata exceeds');

    expect(create).not.toHaveBeenCalled();
  });

  test('links an existing open ticket instead of creating another', async () => {
    const { create, editReply } = await createTicketForExistingTicket(
      'Стар наслов - requester#0001 - Поддршка',
      'Нов наслов',
    );

    expect(create).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      'Веќе имате активен тикет од овој тип: https://discord.com/channels/1/2',
    );
  });

  test('links a legacy ticket named before titles were added', async () => {
    const { create, editReply } = await createTicketForExistingTicket(
      'requester#0001 - Поддршка',
      'Помош',
    );

    expect(create).not.toHaveBeenCalled();
    expect(editReply).toHaveBeenCalledWith(
      'Веќе имате активен тикет од овој тип: https://discord.com/channels/1/2',
    );
  });
});
