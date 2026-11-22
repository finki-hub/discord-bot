import {
  ContainerBuilder,
  heading,
  HeadingLevel,
  SeparatorSpacingSize,
} from 'discord.js';

import { getCommandMention } from '@/common/commands/utils.js';
import { aboutMessage, botName } from '@/translations/about.js';

export const getAboutComponent = () => {
  const containerBuilder = new ContainerBuilder();

  containerBuilder
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(heading(botName, HeadingLevel.Two)),
    )
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        aboutMessage(getCommandMention('help'), getCommandMention('questions')),
      ),
    );

  return containerBuilder;
};
