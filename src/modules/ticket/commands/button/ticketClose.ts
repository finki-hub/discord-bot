import { type ButtonInteraction, MessageFlags } from 'discord.js';

import {
  getTicketCloseConfirmComponents,
  TICKET_CLOSE_CONFIRM_ACTION,
} from '@/modules/ticket/components/components.js';
import { closeTicket } from '@/modules/ticket/utils/tickets.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';
import { ticketMessages } from '@/translations/tickets.js';

export const name = 'ticketClose';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const [ticketId, action] = args;

  if (ticketId === undefined) {
    await interaction.reply({
      content: commandErrors.invalidTicket,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (interaction.guild === null) {
    await interaction.reply({
      content: commandErrors.commandGuildOnly,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (action !== TICKET_CLOSE_CONFIRM_ACTION) {
    await interaction.reply({
      components: getTicketCloseConfirmComponents(ticketId),
      content: ticketMessages.ticketCloseConfirm,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await interaction.deferUpdate();
  await closeTicket(ticketId, interaction.guild.id, interaction.user.id);
  await interaction.editReply({
    components: [],
    content: commandResponses.ticketClosed,
  });
};
