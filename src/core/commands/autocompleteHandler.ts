import type { AutocompleteInteraction } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { trackInteraction } from '@/common/services/analytics.js';

import { errorName, getSurface } from './interactionHandlerUtils.js';
import { getAutocompleteCommand, getCommandModule } from './modules.js';

const isExpectedAutocompleteError = (error: unknown): boolean => {
  const message = Error.isError(error) ? error.message : String(error);
  return (
    message.includes('already been acknowledged') ||
    message.includes('Unknown interaction')
  );
};

const respondWithNoAutocompleteChoices = async (
  interaction: AutocompleteInteraction,
) => {
  try {
    await interaction.respond([]);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    // Autocomplete responses fail silently if the interaction expired.
  }
};

export const handleAutocomplete = async (
  interaction: AutocompleteInteraction,
) => {
  logger.info(
    `[Autocomplete] ${interaction.user.tag}: ${interaction.commandName} [${interaction.guild?.name ?? 'DM'}]`,
  );
  const command = getAutocompleteCommand(interaction.commandName);
  if (command === undefined) {
    await respondWithNoAutocompleteChoices(interaction);
    return;
  }

  const startedAt = Date.now();
  let outcome: 'error' | 'ok' = 'ok';
  let errorType: string | undefined;
  try {
    await command.execute(interaction);
  } catch (error) {
    const caughtError =
      error instanceof Error ? error : new Error(String(error));
    if (!isExpectedAutocompleteError(caughtError)) {
      logger.error(
        `Failed executing autocomplete interaction ${interaction.commandName}\n${caughtError.stack ?? caughtError.message}`,
        { guildId: interaction.guild?.id },
      );
      outcome = 'error';
      errorType = errorName(caughtError);
    }
  } finally {
    await respondWithNoAutocompleteChoices(interaction);
  }

  trackInteraction(interaction.user.id, {
    command: interaction.commandName,
    durationMs: Date.now() - startedAt,
    ...(errorType !== undefined && { errorType }),
    module: getCommandModule(interaction.commandName),
    outcome,
    surface: getSurface(interaction.guildId),
    type: 'autocomplete',
  });
};
