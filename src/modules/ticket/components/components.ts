import {
  ActionRowBuilder,
  type AnyThreadChannel,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { getPaginationComponent } from '@/common/components/pagination.js';
import { TICKETS_PER_PAGE } from '@/modules/ticket/utils/constants.js';
import {
  componentMessages,
  ticketCreateComponents,
} from '@/translations/components.js';
import { emojis } from '@/translations/emojis.js';
import { labels } from '@/translations/labels.js';

import { type Ticket } from '../schemas/Ticket.js';

const TICKET_LIST_BUTTON_ID = 'ticketList';
export const TICKET_CREATE_MODAL_ID = 'ticketCreateModal';
export const TICKET_DESCRIPTION_FIELD = 'description';

const dateFormatter = new Intl.DateTimeFormat('mk-MK', {
  dateStyle: 'long',
  timeStyle: 'short',
});

const buildTicketCreateButtons = (
  ticketTypes: Ticket[],
  startIndex: number,
) => {
  const buttons = [];

  for (let index = startIndex; index < startIndex + 5; index++) {
    const ticketType = ticketTypes[index];

    if (ticketType === undefined) {
      break;
    }

    const button = new ButtonBuilder()
      .setCustomId(`ticketCreate:${ticketType.id}`)
      .setLabel(`${index + 1} ${ticketType.name}`)
      .setStyle(ButtonStyle.Success)
      .setEmoji(emojis[(index + 1).toString()] ?? '🔒');

    buttons.push(button);
  }

  return buttons;
};

export const getTicketCreateComponents = (ticketTypes: Ticket[]) => {
  const components = [];

  for (let index = 0; index < ticketTypes.length; index += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const buttons = buildTicketCreateButtons(ticketTypes, index);

    row.addComponents(buttons);
    components.push(row);
  }

  return components;
};

export const getTicketCreateModal = (ticketTypeId: string) =>
  new ModalBuilder()
    .setCustomId(`${TICKET_CREATE_MODAL_ID}:${ticketTypeId}`)
    .setTitle(ticketCreateComponents.title)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(ticketCreateComponents.descriptionLabel)
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(TICKET_DESCRIPTION_FIELD)
            .setPlaceholder(ticketCreateComponents.placeholder)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2_000),
        ),
    );

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
