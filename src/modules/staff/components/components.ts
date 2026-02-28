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

import { labels } from '@/translations/labels.js';

import { type Staff } from '../schemas/Staff.js';

export const getStaffComponent = (information: Staff) => {
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
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        `**${labels.email}:**\n${hyperlink(information.email, `mailto:${information.email}`)}`,
      ),
    );

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
