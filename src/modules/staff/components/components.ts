import {
  ActionRowBuilder,
  blockQuote,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  hyperlink,
  italic,
  SeparatorSpacingSize,
  strikethrough,
} from 'discord.js';

import { type Consultation } from '@/modules/staff/utils/consultations.js';
import { labels } from '@/translations/labels.js';

import { type Staff } from '../schemas/Staff.js';

// One consultation as "**среда 25.11.** 16:00–18:00 · ТМФ 320".
const consultationLine = ({ date, day, from, room, to }: Consultation) => {
  const [dayOfMonth, month] = date.split('-', 2);
  const when = `**${day} ${dayOfMonth}.${month}.**`;

  return room.length > 0
    ? `${when} ${from}–${to} · ${room}`
    : `${when} ${from}–${to}`;
};

// The most consultations the card lists before "+N".
const CONSULTATIONS_SHOWN = 20;

const consultationLines = (consultations: Consultation[]) => {
  const lines = consultations
    .slice(0, CONSULTATIONS_SHOWN)
    .map((consultation) => consultationLine(consultation));
  const rest = consultations.length - CONSULTATIONS_SHOWN;

  return rest > 0 ? [...lines, `(+${rest})`] : lines;
};

// `consultations`: the coming ones, an empty list for none scheduled, or
// null when unknown (the card then keeps only the link).
export const getStaffComponent = (
  information: Staff,
  consultations: Consultation[] | null = null,
) => {
  const containerBuilder = new ContainerBuilder();

  const displayName = information.active
    ? information.name
    : strikethrough(information.name);

  containerBuilder.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(heading(displayName, HeadingLevel.Two)),
  );

  if (!information.active) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(blockQuote(`:x: ${italic(labels.retired)}`)),
    );
  }

  containerBuilder
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.title}:** ${information.title}`),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.position}:** ${information.position}`),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        `**${labels.cabinet}:** ${information.cabinet ?? '-'}`,
      ),
    )
    .addSeparatorComponents((separator) =>
      separator.setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents((textDisplay) => {
      const mailtoLink = `mailto:${information.email}`;

      return textDisplay.setContent(
        `**${labels.email}:**\n${hyperlink(information.email, mailtoLink)}`,
      );
    });

  if (consultations !== null) {
    const lines =
      consultations.length > 0
        ? consultationLines(consultations)
        : [labels.noConsultations];

    containerBuilder
      .addSeparatorComponents((separator) =>
        separator.setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(
          `**${labels.consultations}**\n${lines.join('\n')}`,
        ),
      );
  }

  const actionRow = new ActionRowBuilder<ButtonBuilder>();

  if (information.profile !== undefined) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setLabel(labels.profile)
        .setURL(information.profile)
        .setStyle(ButtonStyle.Link),
    );
  }

  if (information.courses !== undefined) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setLabel(labels.courses)
        .setURL(information.courses)
        .setStyle(ButtonStyle.Link),
    );
  }

  if (information.consultations !== undefined) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setLabel(labels.consultations)
        .setURL(information.consultations)
        .setStyle(ButtonStyle.Link),
    );
  }

  if (actionRow.components.length > 0) {
    containerBuilder
      .addSeparatorComponents((separator) =>
        separator.setSpacing(SeparatorSpacingSize.Large),
      )
      .addActionRowComponents(actionRow);
  }

  return containerBuilder;
};
