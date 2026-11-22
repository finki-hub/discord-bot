import {
  type AnyThreadChannel,
  ChannelType,
  type Collection,
  ComponentType,
  escapeMarkdown,
  type Guild,
  type Message,
  MessageFlags,
  type ModalSubmitInteraction,
  PermissionFlagsBits,
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
import { commandErrors } from '@/translations/commands.js';
import {
  ticketMessageFunctions,
  ticketMessages,
} from '@/translations/tickets.js';

import {
  getTicketCloseButtonId,
  getTicketCloseComponents,
} from '../components/components.js';
import { type Ticket } from '../schemas/Ticket.js';
import {
  MAX_THREAD_NAME_LENGTH,
  TICKET_ABANDON_TIMEOUT_MILLISECONDS,
  TICKET_REQUEST_FOOTER,
  TICKET_REQUEST_MARKER,
  TICKET_START_LOOKBACK_LIMIT,
} from './constants.js';
import {
  getInactivityAction,
  getInactivityContext,
  sendTicketReminder,
} from './inactivity.js';

const TICKET_NAME_SEPARATOR = ' - ';

// The active-ticket check and thread creation are separate requests, so this
// stops a double submission from passing the check twice.
const ticketCreationsInProgress = new Set<string>();

type TicketOptions = { description: string; title: string };

type TicketRequest = {
  interaction: ModalSubmitInteraction;
  options: TicketOptions;
  ticketMetadata: Ticket;
};

const getTicketThreadSuffix = (
  interaction: ModalSubmitInteraction,
  ticketMetadata: Ticket,
): string =>
  `${interaction.user.tag}${TICKET_NAME_SEPARATOR}${ticketMetadata.name}`;

// Cuts between whole characters so an emoji is never left broken.
const truncateThreadTitle = (title: string, maxLength: number): string => {
  if (title.length <= maxLength) {
    return title;
  }

  const segments = new Intl.Segmenter().segment(title);
  let truncated = '';

  for (const { segment } of segments) {
    if (truncated.length + segment.length > maxLength - 1) {
      break;
    }

    truncated += segment;
  }

  return `${truncated.trimEnd()}…`;
};

// Returns null when the user and type leave no room within Discord's limit.
const getTicketThreadName = (
  interaction: ModalSubmitInteraction,
  ticketMetadata: Ticket,
  title: string,
): null | string => {
  // The title leads the thread name; the user/type suffix keeps existing-ticket
  // detection and type resolution working from the name alone.
  const suffix = getTicketThreadSuffix(interaction, ticketMetadata);

  const maxTitleLength =
    MAX_THREAD_NAME_LENGTH - suffix.length - TICKET_NAME_SEPARATOR.length;

  return maxTitleLength < 1
    ? null
    : `${truncateThreadTitle(title, maxTitleLength)}${TICKET_NAME_SEPARATOR}${suffix}`;
};

const isHumanMessage = (message: Message): boolean =>
  !message.author.bot && !message.system;

// Older modal tickets carry the footer embed; newer ones carry a text marker.
// Role mentions are not a reliable signal: Discord and the role cache can both
// drop them, and an unrecognized ticket is deleted as abandoned.
const isTicketRequest = (message: Message): boolean =>
  message.author.bot &&
  (message.content.includes(TICKET_REQUEST_MARKER) ||
    message.embeds.some(
      (embed) => embed.footer?.text === TICKET_REQUEST_FOOTER,
    ));

// Recent messages may all be the bot on a long ticket; the first user message
// is near the start. A modal-created ticket is already started by its request,
// before the first human reply.
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
  interaction: ModalSubmitInteraction,
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

const sendTicketMessages = async (
  ticketChannel: AnyThreadChannel,
  { interaction, options, ticketMetadata }: TicketRequest,
): Promise<void> => {
  const components = getTicketCloseComponents(ticketChannel.id);

  await ticketChannel.send({
    allowedMentions: {
      parse: [],
      roles: ticketMetadata.roles,
      users: [interaction.user.id],
    },
    components,
    content: ticketMessageFunctions.ticketRequestHeader(
      escapeMarkdown(options.title),
      interaction.user.id,
      ticketMetadata.roles.map((role) => roleMention(role)).join(' '),
    ),
  });
  await ticketChannel.send({
    allowedMentions: { parse: [] },
    content: options.description,
  });
};

// Staff join the thread only through the role mention, so a role the bot cannot
// mention leaves them without access or a notification.
const warnUnmentionableRoles = (
  guild: Guild,
  ticketsChannel: TextChannel,
  roleIds: string[],
): void => {
  const botMember = guild.members.me;

  if (
    botMember === null ||
    botMember
      .permissionsIn(ticketsChannel)
      .has(PermissionFlagsBits.MentionEveryone)
  ) {
    return;
  }

  const unmentionableRoleIds = roleIds.filter(
    (roleId) => guild.roles.cache.get(roleId)?.mentionable !== true,
  );

  if (unmentionableRoleIds.length > 0) {
    logger.warn(
      `Ticket roles cannot be mentioned, so their members will not be added: ${unmentionableRoleIds.join(', ')}`,
      { guildId: guild.id },
    );
  }
};

const createTicketThread = async (
  request: TicketRequest,
  guild: Guild,
): Promise<void> => {
  const { interaction, options, ticketMetadata } = request;
  const guildId = guild.id;
  const ticketsChannel = getChannel(Channel.Tickets, guildId);

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

  const threadName = getTicketThreadName(
    interaction,
    ticketMetadata,
    options.title,
  );

  if (threadName === null) {
    logger.error(`Ticket type ${ticketMetadata.id} has too long a name`, {
      guildId,
    });
    await interaction.editReply(commandErrors.ticketNameTooLong);

    return;
  }

  warnUnmentionableRoles(guild, ticketsChannel, ticketMetadata.roles);

  const ticketChannel = await ticketsChannel.threads.create({
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    invitable: false,
    name: threadName,
    type: ChannelType.PrivateThread,
  });

  try {
    await sendTicketMessages(ticketChannel, request);
  } catch (error: unknown) {
    // Members join through the mentions, so a partial ticket may be
    // inaccessible and would block a retry through the active-ticket check.
    await deleteTicketThread(ticketChannel, guildId);
    throw error;
  }

  await interaction.editReply(
    ticketMessageFunctions.ticketLink(ticketChannel.url),
  );
};

export const createTicket = async (
  interaction: ModalSubmitInteraction,
  ticketMetadata: Ticket,
  options: TicketOptions,
): Promise<void> => {
  if (interaction.guild === null) {
    return;
  }

  const guildId = interaction.guild.id;
  const creationKey = `${guildId}:${interaction.user.id}:${ticketMetadata.id}`;

  if (ticketCreationsInProgress.has(creationKey)) {
    await interaction.editReply(commandErrors.ticketCreationInProgress);

    return;
  }

  ticketCreationsInProgress.add(creationKey);

  try {
    await createTicketThread(
      { interaction, options, ticketMetadata },
      interaction.guild,
    );
  } finally {
    ticketCreationsInProgress.delete(creationKey);
  }
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

const hasTicketCloseButton = (message: Message, customId: string): boolean =>
  message.author.bot &&
  message.components.some(
    (component) =>
      component.type === ComponentType.ActionRow &&
      component.components.some((child) => child.customId === customId),
  );

const disableTicketCloseButton = async (
  thread: AnyThreadChannel,
  guildId: string,
): Promise<void> => {
  try {
    const customId = getTicketCloseButtonId(thread.id);
    const messages = await thread.messages.fetch({
      after: thread.id,
      limit: TICKET_START_LOOKBACK_LIMIT,
    });
    const closeMessage = messages.find((message) =>
      hasTicketCloseButton(message, customId),
    );

    // Older tickets have the button on the user's text, and newer ones on the
    // header. Neither should mention anyone again when edited.
    await closeMessage?.edit({
      allowedMentions: { parse: [] },
      components: getTicketCloseComponents(thread.id, true),
    });
  } catch (error: unknown) {
    logger.warn(
      `Failed disabling close button for ticket ${thread.id}\n${String(error)}`,
      { guildId },
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

  if (ticketChannel === null || ticketChannel.locked === true) {
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

  await disableTicketCloseButton(ticketChannel, guildId);
  await ticketChannel.setLocked(true);
  await ticketChannel.setArchived(true);

  logger.info(`Closed ticket ${ticketId}`);
};

const deleteStaleTicketReminder = async (
  reminder: Message,
  guildId: string,
): Promise<void> => {
  try {
    await reminder.delete();
  } catch (error: unknown) {
    logger.warn(
      `Failed deleting stale inactivity reminder ${reminder.id}\n${String(error)}`,
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

    const inactivity = await getInactivityContext(thread);

    if (inactivity === null) {
      continue;
    }

    if (inactivity.staleReminder !== null) {
      await deleteStaleTicketReminder(inactivity.staleReminder, guildId);
    }

    const action = getInactivityAction({
      lastActivity: inactivity.lastActivity,
      lastReminderStage: inactivity.lastReminderStage,
      now: Date.now(),
    });

    if (action.type === 'close') {
      await closeTicket(thread.id, guildId);
    } else if (action.type === 'remind') {
      await sendTicketReminder(thread, {
        daysLeft: action.daysLeft,
        guildId,
        lastActivity: inactivity.lastActivity,
        stage: action.stage,
      });
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
