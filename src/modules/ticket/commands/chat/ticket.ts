import { InteractionContextType } from 'discord-api-types/v10';
import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { executeSubcommand } from '@/common/commands/subcommands.js';
import { logger } from '@/common/logger/index.js';
import { Channel } from '@/common/schemas/Channel.js';
import { Role } from '@/common/schemas/Role.js';
import {
  getChannelsProperty,
  getTicketingProperty,
} from '@/configuration/bot/index.js';
import {
  getTicketCreateComponents,
  getTicketListComponent,
} from '@/modules/ticket/components/components.js';
import { getActiveTicketsSorted } from '@/modules/ticket/utils/tickets.js';
import {
  commandDescriptions,
  commandErrors,
  commandResponses,
} from '@/translations/commands.js';
import { ticketMessageFunctions } from '@/translations/tickets.js';

export const name = 'ticket';

export const permissions = {
  permissions: [PermissionFlagsBits.ManageMessages],
  roles: [Role.Moderators],
};

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Ticket')
  .addSubcommand((command) =>
    command
      .setName('close')
      .setDescription(commandDescriptions['ticket close']),
  )
  .addSubcommand((command) =>
    command.setName('list').setDescription(commandDescriptions['ticket list']),
  )
  .addSubcommand((command) =>
    command
      .setName('send')
      .setDescription(commandDescriptions['ticket send'])
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Канал во кој да се испрати пораката')
          .setRequired(false),
      ),
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const handleTicketClose = async (interaction: ChatInputCommandInteraction) => {
  if (interaction.guild === null) {
    return;
  }

  const ticketsChannel = await getChannelsProperty(
    Channel.Tickets,
    interaction.guild.id,
  );

  if (
    !interaction.channel?.isThread() ||
    interaction.channel.parentId === null ||
    ticketsChannel === undefined ||
    interaction.channel.parentId !== ticketsChannel
  ) {
    await interaction.editReply(commandErrors.invalidChannel);

    return;
  }

  await interaction.editReply(commandResponses.ticketClosed);

  try {
    await interaction.channel.send({
      allowedMentions: { parse: [] },
      content: ticketMessageFunctions.ticketClosedBy(interaction.user.id),
      flags: MessageFlags.SuppressNotifications,
    });
  } catch (error: unknown) {
    logger.error(
      `Failed sending close message for ticket ${interaction.channel.id}\n${String(error)}`,
      { guildId: interaction.guild.id },
    );
  }

  await interaction.channel.setLocked(true);
  await interaction.channel.setArchived(true);
};

const handleTicketList = async (interaction: ChatInputCommandInteraction) => {
  if (interaction.guild === null) {
    return;
  }

  const ticketThreads = await getActiveTicketsSorted(interaction.guild);

  await interaction.reply({
    components: [getTicketListComponent(ticketThreads, 0)],
    flags: MessageFlags.IsComponentsV2,
  });
};

const handleTicketSend = async (interaction: ChatInputCommandInteraction) => {
  if (interaction.guild === null) {
    return;
  }

  const channelOption = interaction.options.getChannel('channel');
  const targetChannel =
    channelOption === null
      ? interaction.channel
      : await interaction.guild.channels.fetch(channelOption.id);

  if (
    targetChannel === null ||
    !targetChannel.isTextBased() ||
    targetChannel.isDMBased()
  ) {
    await interaction.editReply(commandErrors.invalidChannel);

    return;
  }

  const tickets = await getTicketingProperty('tickets', interaction.guild.id);

  if (tickets === undefined || tickets.length === 0) {
    await interaction.editReply(commandErrors.noTickets);

    return;
  }

  const ticketList = tickets
    .map((ticket) => {
      const prefix = `- ${ticket.name}`;
      return ticket.description ? `${prefix}: ${ticket.description}` : prefix;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Тикети')
    .setDescription(ticketMessageFunctions.ticketSendMessage(ticketList))
    .setTimestamp();

  const components = getTicketCreateComponents(tickets);

  await targetChannel.send({
    components,
    embeds: [embed],
  });

  await interaction.editReply(commandResponses.ticketMessageSent);
};

const ticketHandlers = {
  close: handleTicketClose,
  list: handleTicketList,
  send: handleTicketSend,
};

export const execute = (interaction: ChatInputCommandInteraction) =>
  executeSubcommand(interaction, ticketHandlers);
