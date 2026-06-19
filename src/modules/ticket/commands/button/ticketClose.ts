import { type ButtonInteraction } from 'discord.js';

import { closeTicket } from '@/modules/ticket/utils/tickets.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

export const name = 'ticketClose';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  const ticketId = args[0];

  if (ticketId === undefined) {
    await interaction.editReply(commandErrors.invalidTicket);

    return;
  }

  if (interaction.guild === null) {
    await interaction.editReply(commandErrors.commandGuildOnly);

    return;
  }

  await closeTicket(ticketId, interaction.guild.id, interaction.user.id);
  await interaction.editReply({ content: commandResponses.ticketClosed });
};
