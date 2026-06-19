import {
  type AnyThreadChannel,
  type ButtonInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  type Collection,
  type Guild,
  MessageFlags,
  roleMention,
  ThreadAutoArchiveDuration,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { Channel } from '@/common/schemas/Channel.js';
import { getChannel } from '@/common/services/channels.js';
import { getChannelsProperty } from '@/configuration/bot/index.js';
import { client } from '@/core/client.js';
import {
  ticketMessageFunctions,
  ticketMessages,
} from '@/translations/tickets.js';

import { getTicketCloseComponents } from '../components/components.js';
import { type Ticket } from '../schemas/Ticket.js';
import { MAX_TICKET_INACTIVITY_MILLISECONDS } from './constants.js';

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
    name: `${interaction.user.tag} - ${ticketMetadata.name}`,
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

  const collector = ticketChannel.createMessageCollector({
    time: 1_800_000,
  });

  collector.once('collect', async () => {
    await ticketChannel.send(
      ticketMessageFunctions.ticketStarted(
        ticketMetadata.roles.map((role) => roleMention(role)).join(' '),
      ),
    );

    collector.stop();
  });

  collector.on('end', async (messages) => {
    if (messages.size > 0) {
      return;
    }

    try {
      await ticketChannel.delete();
    } catch (error: unknown) {
      logger.error(
        `Failed deleting ticket channel ${ticketChannel.id}\n${String(error)}`,
        { guildId: interaction.guild?.id },
      );
    }
  });
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

  const ticketChannel = ticketsChannel.threads.cache.get(ticketId);

  if (ticketChannel === undefined) {
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

const closeInactiveThreads = async (
  ticketThreads: Collection<string, AnyThreadChannel>,
  guildId: string,
) => {
  for (const thread of ticketThreads.values()) {
    await thread.messages.fetch();
    const lastMessage = thread.lastMessage;

    if (lastMessage === null) {
      continue;
    }

    const lastMessageDate = lastMessage.createdAt;

    if (
      Date.now() - lastMessageDate.getTime() >
      MAX_TICKET_INACTIVITY_MILLISECONDS
    ) {
      await closeTicket(thread.id, guildId);
    }
  }
};

export const closeInactiveTickets = async () => {
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

    await closeInactiveThreads(ticketThreads, guild.id);
  }
};
