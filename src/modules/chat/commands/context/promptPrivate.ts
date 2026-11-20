import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type MessageContextMenuCommandInteraction,
} from 'discord.js';

import { executePromptContext } from './prompt.js';

export const name = 'Prompt Privately';

// A separate command keeps the existing public `Prompt` behavior unchanged.
// The context-menu handler defers with this before the command executes.
export const ephemeral = true;

export const data = new ContextMenuCommandBuilder()
  .setName(name)
  .setType(ApplicationCommandType.Message);

export const execute = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  await executePromptContext(interaction, 'Prompt privately context command');
};
