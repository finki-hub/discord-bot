import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  SeparatorSpacingSize,
} from 'discord.js';

import {
  MAX_ACTION_ROW_BUTTONS,
  truncateButtonLabel,
} from '@/common/utils/limits.js';

import type { Question } from '../schemas/Question.js';

import { getButtonLinks } from '../utils/links.js';

// The most link buttons a card holds within Discord's component limit; a
// question with more lists its links as text.
export const MAX_LINK_BUTTONS = 25;

export const getQuestionComponent = (question: Question) => {
  const containerBuilder = new ContainerBuilder();

  containerBuilder
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(heading(question.name, HeadingLevel.Two)),
    )
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(question.content),
    );

  if (question.links !== null) {
    const linkEntries = getButtonLinks(question.links);

    if (linkEntries.length > 0) {
      containerBuilder.addSeparatorComponents((separator) =>
        separator.setSpacing(SeparatorSpacingSize.Large),
      );

      for (let i = 0; i < linkEntries.length; i += MAX_ACTION_ROW_BUTTONS) {
        const chunk = linkEntries.slice(i, i + MAX_ACTION_ROW_BUTTONS);
        const actionRow = new ActionRowBuilder<ButtonBuilder>();

        for (const [name, url] of chunk) {
          actionRow.addComponents(
            new ButtonBuilder()
              .setLabel(truncateButtonLabel(name))
              .setURL(url)
              .setStyle(ButtonStyle.Link),
          );
        }

        containerBuilder.addActionRowComponents(actionRow);
      }
    }
  }

  return containerBuilder;
};
