import { InteractionContextType } from 'discord-api-types/v10';
import {
  type ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';

import { Role } from '@/common/schemas/Role.js';
import { truncateComponentText } from '@/common/utils/limits.js';
import { getTicketingProperty } from '@/configuration/bot/index.js';
import { getTicketCreateComponents } from '@/modules/ticket/components/components.js';
import {
  commandDescriptions,
  commandErrors,
  commandResponses,
} from '@/translations/commands.js';
import { ticketMessageFunctions } from '@/translations/tickets.js';

export const name = 'tickets';

export const permissions = {
  permissions: [PermissionFlagsBits.ManageGuild],
  roles: [Role.Administrators],
};

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name])
  .addChannelOption((option) =>
    option
      .setName('channel')
      .setDescription('Канал во кој да се испрати пораката')
      .setRequired(false),
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const execute = async (interaction: ChatInputCommandInteraction) => {
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

  await targetChannel.send({
    allowedMentions: { parse: [] },
    components: [
      new TextDisplayBuilder().setContent(
        truncateComponentText(
          ticketMessageFunctions.ticketSendMessage(ticketList),
        ),
      ),
      ...getTicketCreateComponents(tickets),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  await interaction.editReply(commandResponses.ticketMessageSent);
};
