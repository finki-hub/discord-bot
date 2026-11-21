import {
  ChannelType,
  MessageFlags,
  type ModalSubmitInteraction,
} from 'discord.js';

import { Channel } from '@/common/schemas/Channel.js';
import { getChannel } from '@/common/services/channels.js';
import { getMembersByRoleIds } from '@/common/services/roles.js';
import {
  getTicketingProperty,
  getTicketProperty,
} from '@/configuration/bot/index.js';
import {
  TICKET_DESCRIPTION_FIELD,
  TICKET_TITLE_FIELD,
} from '@/modules/ticket/components/components.js';
import {
  createTicket,
  findActiveTicket,
} from '@/modules/ticket/utils/tickets.js';
import { commandErrors } from '@/translations/commands.js';
import { ticketMessageFunctions } from '@/translations/tickets.js';

export const name = 'ticketCreateModal';

export const execute = async (
  interaction: ModalSubmitInteraction,
  args: string[],
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.guild === null) {
    await interaction.editReply(commandErrors.commandGuildOnly);
    return;
  }

  const ticketType = args[0];
  const enabled = await getTicketingProperty('enabled', interaction.guild.id);

  if (!enabled) {
    await interaction.editReply(commandErrors.ticketingDisabled);
    return;
  }

  if (ticketType === undefined) {
    await interaction.editReply(commandErrors.invalidTicketType);
    return;
  }

  const ticketMetadata = await getTicketProperty(
    ticketType,
    interaction.guild.id,
  );

  if (ticketMetadata === undefined) {
    await interaction.editReply(commandErrors.invalidTicketType);
    return;
  }

  const ticketsChannel = getChannel(Channel.Tickets, interaction.guild.id);

  if (ticketsChannel?.type !== ChannelType.GuildText) {
    await interaction.editReply(commandErrors.invalidChannel);
    return;
  }

  if (ticketMetadata.roles.length === 0) {
    await interaction.editReply(commandErrors.noTicketMembers);
    return;
  }

  const existingTicket = await findActiveTicket(interaction, ticketMetadata);

  if (existingTicket !== undefined) {
    await interaction.editReply(
      ticketMessageFunctions.ticketExisting(existingTicket.url),
    );
    return;
  }

  const title = interaction.fields.getTextInputValue(TICKET_TITLE_FIELD).trim();
  const description = interaction.fields
    .getTextInputValue(TICKET_DESCRIPTION_FIELD)
    .trim();

  if (title.length === 0) {
    await interaction.editReply(commandErrors.ticketTitleRequired);
    return;
  }

  if (description.length === 0) {
    await interaction.editReply(commandErrors.ticketDescriptionRequired);
    return;
  }

  const ticketRoleMembers = await getMembersByRoleIds(
    interaction.guild,
    ticketMetadata.roles,
  );

  if (ticketRoleMembers.length === 0) {
    await interaction.editReply(commandErrors.noTicketMembers);
    return;
  }

  await createTicket(interaction, ticketMetadata, {
    description,
    memberIds: ticketRoleMembers,
    title,
  });
};
