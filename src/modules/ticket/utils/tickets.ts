import {
  type AnyThreadChannel,
  type ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type Collection,
  EmbedBuilder,
  type Guild,
  type Message,
  MessageFlags,
  type ModalSubmitInteraction,
  roleMention,
  type TextChannel,
  ThreadAutoArchiveDuration,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { Channel } from '@/common/schemas/Channel.js';
import { getChannel } from '@/common/services/channels.js';
import {
  getChannelsProperty,
  getTicketingProperty,
} from '@/configuration/bot/index.js';
import { client } from '@/core/client.js';
import {
  ticketMessageFunctions,
  ticketMessages,
} from '@/translations/tickets.js';

import { getTicketCloseComponents } from '../components/components.js';
import { type Ticket } from '../schemas/Ticket.js';
import {
  MAX_THREAD_NAME_LENGTH,
  MAX_TICKET_INACTIVITY_MILLISECONDS,
  TICKET_ABANDON_TIMEOUT_MILLISECONDS,
  TICKET_REQUEST_FOOTER,
  TICKET_START_LOOKBACK_LIMIT,
} from './constants.js';

const TICKET_NAME_SEPARATOR = ' - ';
const THREAD_MEMBER_ADD_CONCURRENCY = 5;
// Discord allows up to 1,000 members in a thread; the bot and requester take
// two of those slots.
const MAX_THREAD_MEMBERS = 1_000;

type TicketInteraction =
  ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction;

const getTicketThreadSuffix = (
  interaction: TicketInteraction,
  ticketMetadata: Ticket,
): string =>
  `${interaction.user.tag}${TICKET_NAME_SEPARATOR}${ticketMetadata.name}`;

const getTicketThreadName = (
  interaction: TicketInteraction,
  ticketMetadata: Ticket,
  title?: string,
): string => {
  // The title leads the thread name; the user/type suffix keeps existing-ticket
  // detection and type resolution working from the name alone.
  const suffix = getTicketThreadSuffix(interaction, ticketMetadata);

  if (title === undefined || title.length === 0) {
    if (suffix.length > MAX_THREAD_NAME_LENGTH) {
      throw new Error(
        `Ticket thread metadata exceeds Discord's ${MAX_THREAD_NAME_LENGTH}-character limit.`,
      );
    }

    return suffix;
  }

  const maxTitleLength =
    MAX_THREAD_NAME_LENGTH - suffix.length - TICKET_NAME_SEPARATOR.length;

  if (maxTitleLength < 1) {
    throw new Error(
      `Ticket thread metadata exceeds Discord's ${MAX_THREAD_NAME_LENGTH}-character limit.`,
    );
  }

  return `${title.slice(0, maxTitleLength)}${TICKET_NAME_SEPARATOR}${suffix}`;
};

const addTicketMember = async (
  ticketChannel: AnyThreadChannel,
  memberId: string,
  guildId: string,
): Promise<void> => {
  try {
    await ticketChannel.members.add(memberId);
  } catch (error: unknown) {
    logger.warn(
      `Failed adding member ${memberId} to ticket ${ticketChannel.id}\n${String(error)}`,
      { guildId },
    );
  }
};

const addTicketMembers = async (
  ticketChannel: AnyThreadChannel,
  memberIds: string[],
  guildId: string,
): Promise<void> => {
  for (
    let index = 0;
    index < memberIds.length;
    index += THREAD_MEMBER_ADD_CONCURRENCY
  ) {
    await Promise.all(
      memberIds
        .slice(index, index + THREAD_MEMBER_ADD_CONCURRENCY)
        .map((memberId) => addTicketMember(ticketChannel, memberId, guildId)),
    );
  }
};

const isHumanMessage = (message: Message): boolean =>
  !message.author.bot && !message.system;

const isTicketRequest = (message: Message): boolean =>
  message.author.bot &&
  message.embeds.some((embed) => embed.footer?.text === TICKET_REQUEST_FOOTER);

// Recent messages may all be the bot on a long ticket; the first user message
// is near the start. A modal-created ticket is already started by its request
// embed, before the first human reply.
const hasTicketStarted = async (thread: AnyThreadChannel): Promise<boolean> => {
  const earliestMessages = await thread.messages.fetch({
    after: thread.id,
    limit: TICKET_START_LOOKBACK_LIMIT,
  });

  return earliestMessages.some(
    (message) => isHumanMessage(message) || isTicketRequest(message),
  );
};

const resolveTicketThread = async (
  ticketsChannel: TextChannel,
  ticketId: string,
): Promise<AnyThreadChannel | null> => {
  const cachedThread = ticketsChannel.threads.cache.get(ticketId);

  if (cachedThread !== undefined) {
    return cachedThread;
  }

  try {
    return await ticketsChannel.threads.fetch(ticketId);
  } catch {
    return null;
  }
};

export const getActiveTickets = async (
  guild: Guild,
): Promise<Collection<string, AnyThreadChannel> | undefined> => {
  const ticketsChannelId = await getChannelsProperty(Channel.Tickets, guild.id);

  return ticketsChannelId === undefined
    ? undefined
    : guild.channels.cache.filter(
        (channel): channel is AnyThreadChannel =>
          channel.isThread() &&
          channel.parentId === ticketsChannelId &&
          !channel.archived &&
          !channel.locked,
      );
};

export const findActiveTicket = async (
  interaction: TicketInteraction,
  ticketMetadata: Ticket,
): Promise<AnyThreadChannel | undefined> => {
  if (interaction.guild === null) {
    return undefined;
  }

  // Thread names are the only stable association available for tickets created
  // before the modal flow; a renamed thread or changed username can still miss.
  const activeTickets = await getActiveTickets(interaction.guild);
  const suffix = getTicketThreadSuffix(interaction, ticketMetadata);

  return activeTickets?.find(
    (thread) =>
      thread.name === suffix ||
      thread.name.endsWith(`${TICKET_NAME_SEPARATOR}${suffix}`),
  );
};

export const getActiveTicketsSorted = async (
  guild: Guild,
): Promise<AnyThreadChannel[]> => {
  const ticketThreadsCollection = await getActiveTickets(guild);
  const ticketThreads =
    ticketThreadsCollection === undefined
      ? []
      : ticketThreadsCollection.values().toArray();

  ticketThreads.sort((a: AnyThreadChannel, b: AnyThreadChannel) => {
    if (a.createdTimestamp === null || b.createdTimestamp === null) {
      return 0;
    }

    if (a.createdTimestamp < b.createdTimestamp) {
      return -1;
    }

    return a.createdTimestamp > b.createdTimestamp ? 1 : 0;
  });

  return ticketThreads;
};

export const createTicket = async (
  interaction: TicketInteraction,
  ticketMetadata: Ticket,
  options: { description?: string; memberIds?: string[]; title?: string } = {},
): Promise<void> => {
  if (interaction.guild === null) {
    return;
  }

  const ticketsChannel = getChannel(Channel.Tickets, interaction.guild.id);

  if (ticketsChannel?.type !== ChannelType.GuildText) {
    return;
  }

  const existingTicket = await findActiveTicket(interaction, ticketMetadata);

  if (existingTicket !== undefined) {
    await interaction.editReply(
      ticketMessageFunctions.ticketExisting(existingTicket.url),
    );

    return;
  }

  const ticketChannel = await ticketsChannel.threads.create({
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    invitable: false,
    name: getTicketThreadName(interaction, ticketMetadata, options.title),
    type: ChannelType.PrivateThread,
  });

  // Role mentions invite small roles, but explicit membership also covers
  // large roles and makes the requester's access deterministic.
  await addTicketMember(
    ticketChannel,
    interaction.user.id,
    interaction.guild.id,
  );

  const staffMemberIds = [
    ...new Set(
      (options.memberIds ?? []).filter(
        (memberId) => memberId !== interaction.user.id,
      ),
    ),
  ];
  const maxStaffMemberCount = MAX_THREAD_MEMBERS - 2;
  if (staffMemberIds.length > maxStaffMemberCount) {
    logger.warn(
      `Ticket ${ticketChannel.id} has more staff members than Discord's thread limit; adding the first ${maxStaffMemberCount}.`,
      { guildId: interaction.guild.id },
    );
    staffMemberIds.length = maxStaffMemberCount;
  }

  await addTicketMembers(ticketChannel, staffMemberIds, interaction.guild.id);

  await ticketChannel.send(
    ticketMessageFunctions.ticketCreated(interaction.user.id),
  );

  if (options.description !== undefined) {
    const request = new EmbedBuilder()
      .setAuthor({
        iconURL: interaction.user.displayAvatarURL(),
        name: interaction.user.tag,
      })
      .setDescription(options.description)
      .setFooter({ text: TICKET_REQUEST_FOOTER })
      .setTimestamp();

    if (options.title !== undefined) {
      request.setTitle(options.title);
    }

    await ticketChannel.send({ embeds: [request] });
    await ticketChannel.send(
      ticketMessageFunctions.ticketStarted(
        ticketMetadata.roles.map((role) => roleMention(role)).join(' '),
      ),
    );
  }

  const components = getTicketCloseComponents(ticketChannel.id);
  await ticketChannel.send({
    components,
    content: ticketMessages.sendMessage,
  });

  await interaction.editReply(
    ticketMessageFunctions.ticketLink(ticketChannel.url),
  );
};

export const findTicketTypeByThreadName = (
  threadName: string,
  tickets: Ticket[],
): Ticket | undefined => {
  const legacySeparatorIndex = threadName.indexOf(TICKET_NAME_SEPARATOR);

  if (legacySeparatorIndex !== -1) {
    const legacyName = threadName.slice(
      legacySeparatorIndex + TICKET_NAME_SEPARATOR.length,
    );
    const legacyTicket = tickets.find((ticket) => ticket.name === legacyName);

    if (legacyTicket !== undefined) {
      return legacyTicket;
    }
  }

  // New names are "<title> - <tag> - <type>"; use the longest configured name
  // that the thread name ends with so type names may contain separators.
  return tickets
    .filter((ticket) =>
      threadName.endsWith(`${TICKET_NAME_SEPARATOR}${ticket.name}`),
    )
    .sort((a, b) => b.name.length - a.name.length)[0];
};

const getTicketType = async (
  thread: AnyThreadChannel,
  guildId: string,
): Promise<Ticket | undefined> => {
  const tickets = await getTicketingProperty('tickets', guildId);

  return tickets === undefined
    ? undefined
    : findTicketTypeByThreadName(thread.name, tickets);
};

const startTicket = async (
  thread: AnyThreadChannel,
  guildId: string,
): Promise<void> => {
  const ticketType = await getTicketType(thread, guildId);

  if (ticketType === undefined) {
    logger.warn(`Could not resolve the ticket type for thread ${thread.id}`, {
      guildId,
    });

    return;
  }

  await thread.send(
    ticketMessageFunctions.ticketStarted(
      ticketType.roles.map((role) => roleMention(role)).join(' '),
    ),
  );
};

export const handleTicketMessage = async (message: Message): Promise<void> => {
  if (message.guild === null || !isHumanMessage(message)) {
    return;
  }

  const { channel } = message;

  if (!channel.isThread()) {
    return;
  }

  try {
    const ticketsChannelId = await getChannelsProperty(
      Channel.Tickets,
      message.guild.id,
    );

    if (
      ticketsChannelId === undefined ||
      channel.parentId !== ticketsChannelId
    ) {
      return;
    }

    const previousMessages = await channel.messages.fetch({
      before: message.id,
      limit: TICKET_START_LOOKBACK_LIMIT,
    });

    if (
      previousMessages.some(
        (previous) => isHumanMessage(previous) || isTicketRequest(previous),
      )
    ) {
      return;
    }

    await startTicket(channel, message.guild.id);
  } catch (error: unknown) {
    logger.error(
      `Failed handling ticket message in thread ${channel.id}\n${String(error)}`,
      { guildId: message.guild.id },
    );
  }
};

export const closeTicket = async (
  ticketId: string,
  guildId: string,
  closedBy?: string,
) => {
  const ticketsChannel = getChannel(Channel.Tickets, guildId);

  if (ticketsChannel?.type !== ChannelType.GuildText) {
    return;
  }

  const ticketChannel = await resolveTicketThread(ticketsChannel, ticketId);

  if (ticketChannel === null) {
    return;
  }

  try {
    await ticketChannel.send({
      allowedMentions: {
        parse: [],
      },
      content:
        closedBy === undefined
          ? ticketMessages.ticketClosedInactivity
          : ticketMessageFunctions.ticketClosedBy(closedBy),
      flags: MessageFlags.SuppressNotifications,
    });
  } catch (error: unknown) {
    logger.error(
      `Failed sending close message for ticket ${ticketId}\n${String(error)}`,
      { guildId },
    );
  }

  await ticketChannel.setLocked(true);
  await ticketChannel.setArchived(true);

  logger.info(`Closed ticket ${ticketId}`);
};

const deleteTicketThread = async (
  thread: AnyThreadChannel,
  guildId: string,
): Promise<void> => {
  try {
    await thread.delete();
  } catch (error: unknown) {
    logger.error(
      `Failed deleting ticket channel ${thread.id}\n${String(error)}`,
      { guildId },
    );
  }
};

const maintainTicketThreads = async (
  ticketThreads: Collection<string, AnyThreadChannel>,
  guildId: string,
) => {
  for (const thread of ticketThreads.values()) {
    if (!(await hasTicketStarted(thread))) {
      if (
        thread.createdTimestamp !== null &&
        Date.now() - thread.createdTimestamp >
          TICKET_ABANDON_TIMEOUT_MILLISECONDS
      ) {
        await deleteTicketThread(thread, guildId);
      }

      continue;
    }

    let lastMessage = thread.lastMessage;
    if (lastMessage === null) {
      const latestMessages = await thread.messages.fetch({ limit: 1 });
      lastMessage = latestMessages.first() ?? null;
    }

    if (lastMessage === null) {
      continue;
    }

    if (
      Date.now() - lastMessage.createdAt.getTime() >
      MAX_TICKET_INACTIVITY_MILLISECONDS
    ) {
      await closeTicket(thread.id, guildId);
    }
  }
};

export const maintainTickets = async () => {
  await client.guilds.fetch();

  for (const guild of client.guilds.cache.values()) {
    const ticketsChannelId = await getChannelsProperty(
      Channel.Tickets,
      guild.id,
    );

    if (ticketsChannelId === undefined) {
      continue;
    }

    const ticketThreads = guild.channels.cache.filter(
      (channel): channel is AnyThreadChannel =>
        channel.isThread() &&
        channel.parentId === ticketsChannelId &&
        !channel.archived &&
        !channel.locked,
    );

    if (ticketThreads.size === 0) {
      continue;
    }

    await maintainTicketThreads(ticketThreads, guild.id);
  }
};
