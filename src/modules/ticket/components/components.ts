import {
  ActionRowBuilder,
  type AnyThreadChannel,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

import { getPaginationComponent } from '@/common/components/pagination.js';
import { TICKETS_PER_PAGE } from '@/modules/ticket/utils/constants.js';
import { componentMessages } from '@/translations/components.js';
import { emojis } from '@/translations/emojis.js';
import { labels } from '@/translations/labels.js';

import { type Ticket } from '../schemas/Ticket.js';

const TICKET_LIST_BUTTON_ID = 'ticketList';

const dateFormatter = new Intl.DateTimeFormat('mk-MK', {
  dateStyle: 'long',
  timeStyle: 'short',
});

export const getTicketCreateComponents = (ticketTypes: Ticket[]) => {
  const components = [];

  for (let index1 = 0; index1 < ticketTypes.length; index1 += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const buttons = [];

    for (let index2 = index1; index2 < index1 + 5; index2++) {
      const ticketType = ticketTypes[index2];

      if (ticketType === undefined) {
        break;
      }

      const button = new ButtonBuilder()
        .setCustomId(`ticketCreate:${ticketType.id}`)
        .setLabel(`${index2 + 1} ${ticketType.name}`)
        .setStyle(ButtonStyle.Success)
        .setEmoji(emojis[(index2 + 1).toString()] ?? '🔒');

      buttons.push(button);
    }

    row.addComponents(buttons);
    components.push(row);
  }

  return components;
};

export const getTicketCloseComponents = (ticketId: string) => {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const button = new ButtonBuilder()
    .setCustomId(`ticketClose:${ticketId}`)
    .setLabel(labels.close)
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  row.addComponents(button);

  return [row];
};

export const getTicketListComponent = (
  ticketThreads: AnyThreadChannel[],
  page: number,
) =>
  getPaginationComponent({
    buttonId: TICKET_LIST_BUTTON_ID,
    description: componentMessages.allTickets,
    entries: ticketThreads.map(
      (thread) =>
        `${thread.url} (${thread.createdAt === null ? labels.none : dateFormatter.format(thread.createdAt)})`,
    ),
    entriesLabel: labels.tickets,
    page,
    pageSize: TICKETS_PER_PAGE,
    title: labels.tickets,
  });
