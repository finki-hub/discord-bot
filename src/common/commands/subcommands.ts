import type { ChatInputCommandInteraction } from 'discord.js';

export const executeSubcommand = async (
  interaction: ChatInputCommandInteraction,
  handlers: Record<
    string,
    (interaction: ChatInputCommandInteraction) => Promise<void>
  >,
): Promise<void> => {
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommand === null) {
    return;
  }

  await handlers[subcommand]?.(interaction);
};
