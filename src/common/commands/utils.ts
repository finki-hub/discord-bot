import type { ChatInputCommandInteraction } from 'discord.js';

import { client } from '@/core/client.js';

export const getCommandMention = (name: string | undefined) => {
  if (name === undefined) {
    return '';
  }

  const separatorIndex = name.indexOf(' ');
  const commandName =
    separatorIndex === -1 ? name : name.slice(0, separatorIndex);
  const command = client.application?.commands.cache.find(
    (cmd) => cmd.name === commandName,
  );

  return command === undefined ? name : `</${name}:${command.id}>`;
};

export const getFullCommandName = (
  interaction: ChatInputCommandInteraction,
) => {
  const subcommand = interaction.options.getSubcommand(false);

  return subcommand === null
    ? interaction.commandName
    : `${interaction.commandName} ${subcommand}`;
};
