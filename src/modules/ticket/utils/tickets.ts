import {
  type AnyThreadChannel,
  type ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type Collection,
  type Guild,
  type Message,
  MessageFlags,
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
  MAX_TICKET_INACTIVITY_MILLISECONDS,
  TICKET_ABANDON_TIMEOUT_MILLISECONDS,
} from './constants.js';

const TICKET_NAME_SEPARATOR = ' - ';

const isHumanMessage = (message: Message): boolean =>
  !message.author.bot && !message.system;

// Recent messages may all be the bot on a long ticket; the first user message
// is near the start.
const hasHumanMessageAtStart = async (
  thread: AnyThreadChannel,
): Promise<boolean> => {
  const earliestMessages = await thread.messages.fetch({
    after: thread.id,
    limit: 10,
  });

  return earliestMessages.some((message) => isHumanMessage(message));
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

  if (ticketsChannelId === undefined) {
    return undefined;
  }

  return guild.channels.cache.filter(
    (channel): channel is AnyThreadChannel =>
      channel.isThread() &&
      channel.parentId === ticketsChannelId &&
      !channel.archived &&
      !channel.locked,
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

    if (a.createdTimestamp > b.createdTimestamp) {
      return 1;
    }

    return 0;
  });

  return ticketThreads;
};

export const createTicket = async (
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  ticketMetadata: Ticket,
): Promise<void> => {
  if (interaction.guild === null) {
    return;
  }

  const ticketsChannel = getChannel(Channel.Tickets, interaction.guild.id);

  if (ticketsChannel?.type !== ChannelType.GuildText) {
    return;
  }

  const ticketChannel = await ticketsChannel.threads.create({
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    invitable: false,
    name: `${interaction.user.tag}${TICKET_NAME_SEPARATOR}${ticketMetadata.name}`,
    type: ChannelType.PrivateThread,
  });

  await ticketChannel.send(
    ticketMessageFunctions.ticketCreated(interaction.user.id),
  );

  const components = getTicketCloseComponents(ticketChannel.id);
  await ticketChannel.send({
    components,
    content: ticketMessages.sendMessage,
  });

  await interaction.editReply(
    ticketMessageFunctions.ticketLink(ticketChannel.url),
  );
};

const getTicketType = async (
  thread: AnyThreadChannel,
  guildId: string,
): Promise<Ticket | undefined> => {
  const separatorIndex = thread.name.indexOf(TICKET_NAME_SEPARATOR);

  if (separatorIndex === -1) {
    return undefined;
  }

  const ticketTypeName = thread.name.slice(
    separatorIndex + TICKET_NAME_SEPARATOR.length,
  );
  const tickets = await getTicketingProperty('tickets', guildId);

  return tickets?.find((ticket) => ticket.name === ticketTypeName);
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
      limit: 50,
    });

    if (previousMessages.some((previous) => isHumanMessage(previous))) {
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
    const messages = await thread.messages.fetch();
    const isStarted =
      messages.some((message) => isHumanMessage(message)) ||
      (await hasHumanMessageAtStart(thread));

    if (!isStarted) {
      if (
        thread.createdTimestamp !== null &&
        Date.now() - thread.createdTimestamp >
          TICKET_ABANDON_TIMEOUT_MILLISECONDS
      ) {
        await deleteTicketThread(thread, guildId);
      }

      continue;
    }

    const lastMessage = thread.lastMessage;

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
