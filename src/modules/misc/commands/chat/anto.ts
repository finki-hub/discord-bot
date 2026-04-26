import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import { getRandomQuote } from '@/modules/misc/utils/data.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'anto';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = (interaction: ChatInputCommandInteraction) => {
  const randomQuote = getRandomQuote();

  return interaction.editReply(randomQuote ?? commandErrors.dataFetchFailed);
};
