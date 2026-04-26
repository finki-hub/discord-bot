import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import {
  commandDescriptions,
  commandResponses,
} from '@/translations/commands.js';

export const name = 'home';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = (interaction: ChatInputCommandInteraction) =>
  interaction.editReply({
    content: commandResponses.home,
  });
