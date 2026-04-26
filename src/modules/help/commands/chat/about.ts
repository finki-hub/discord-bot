import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getAboutComponent } from '@/modules/help/components/components.js';
import { commandDescriptions } from '@/translations/commands.js';

export const name = 'about';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = (interaction: ChatInputCommandInteraction) => {
  const component = getAboutComponent();
  return interaction.editReply({
    components: [component],
    flags: MessageFlags.IsComponentsV2,
  });
};
