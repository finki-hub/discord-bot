import { type ButtonInteraction, ChannelType, MessageFlags } from 'discord.js';

import { Channel } from '@/common/schemas/Channel.js';
import { getChannel } from '@/common/services/channels.js';
import {
  getTicketingProperty,
  getTicketProperty,
} from '@/configuration/bot/index.js';
import { getTicketCreateModal } from '@/modules/ticket/components/components.js';
import { commandErrors } from '@/translations/commands.js';

export const name = 'ticketCreate';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  if (interaction.guild === null) {
    await interaction.reply({
      content: commandErrors.commandGuildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const ticketType = args[0];

  const enabled = await getTicketingProperty('enabled', interaction.guild.id);

  if (!enabled) {
    await interaction.reply({
      content: commandErrors.ticketingDisabled,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (ticketType === undefined) {
    await interaction.reply({
      content: commandErrors.invalidTicketType,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const ticketMetadata = await getTicketProperty(
    ticketType,
    interaction.guild.id,
  );

  if (ticketMetadata === undefined) {
    await interaction.reply({
      content: commandErrors.invalidTicketType,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const ticketsChannel = getChannel(Channel.Tickets, interaction.guild.id);

  if (ticketsChannel?.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: commandErrors.invalidChannel,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (ticketMetadata.roles.length === 0) {
    await interaction.reply({
      content: commandErrors.noTicketMembers,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await interaction.showModal(getTicketCreateModal(ticketType));
};
