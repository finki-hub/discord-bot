import type { ChatInputCommandInteraction } from 'discord.js';

type HandlerWithContext<T> = (
  interaction: ChatInputCommandInteraction,
  context: T,
) => Promise<void>;

type HandlerWithoutContext = (
  interaction: ChatInputCommandInteraction,
) => Promise<void>;

const callHandler = <T>(
  handler: HandlerWithContext<T> | HandlerWithoutContext,
  interaction: ChatInputCommandInteraction,
  context: T | undefined,
): Promise<void> => {
  if (context === undefined) {
    return (handler as HandlerWithoutContext)(interaction);
  }

  return handler(interaction, context);
};

export const executeSubcommand = async <T = void>(
  interaction: ChatInputCommandInteraction,
  handlers: Record<string, HandlerWithContext<T> | HandlerWithoutContext>,
  context?: T,
): Promise<void> => {
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommand === null) {
    return;
  }

  const handler = handlers[subcommand];

  if (handler === undefined) {
    return;
  }

  await callHandler(handler, interaction, context);
};
