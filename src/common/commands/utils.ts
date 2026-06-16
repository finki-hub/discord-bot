import type { ChatInputCommandInteraction } from 'discord.js';

import { client } from '@/core/client.js';

export const getCommandMention = (name: string | undefined) => {
  if (name === undefined) {
    return '';
  }

  const command = client.application?.commands.cache.find(
    (cmd) => cmd.name === (name.includes(' ') ? name.split(' ', 1)[0] : name),
  );

  if (command === undefined) {
    return name;
  }

  return `</${name}:${command.id}>`;
};

export const getFullCommandName = (
  interaction: ChatInputCommandInteraction,
) => {
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommand === null) {
    return interaction.commandName;
  }

  return `${interaction.commandName} ${subcommand}`;
};
