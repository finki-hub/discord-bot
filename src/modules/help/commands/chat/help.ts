import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import { handleListCommands } from '@/modules/list/commands/chat/list.js';
import { commandDescriptions } from '@/translations/commands.js';

export const name = 'help';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = (interaction: ChatInputCommandInteraction) =>
  handleListCommands(interaction);
