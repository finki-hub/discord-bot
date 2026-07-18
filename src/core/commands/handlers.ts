import {
  type ChatInputCommandInteraction,
  inlineCode,
  MessageFlags,
} from 'discord.js';

import { getFullCommandName } from '@/common/commands/utils.js';
import { logger } from '@/common/logger/index.js';
import { trackInteraction } from '@/common/services/analytics.js';
import { commandErrors } from '@/translations/commands.js';

import {
  errorName,
  getSurface,
  hasInteractionCommandPermission,
  isMissingPermissionsError,
  notifyMissingApplicationCommand,
  shouldDeferCommand,
} from './interactionHandlerUtils.js';
import { getChatCommand, getCommandModule } from './modules.js';

export const handleChatInputCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  const commandWithSubcommand = getFullCommandName(interaction);
  logger.info(
    `[Chat] ${interaction.user.tag}: ${commandWithSubcommand} [${interaction.guild?.name ?? 'DM'}]`,
  );

  const command = getChatCommand(interaction.commandName);
  if (command === undefined) {
    await notifyMissingApplicationCommand(interaction, interaction.commandName);
    return;
  }
  if (
    !(await hasInteractionCommandPermission(interaction, commandWithSubcommand))
  ) {
    return;
  }

  if (shouldDeferCommand(commandWithSubcommand, interaction.commandName)) {
    try {
      await interaction.deferReply();
    } catch (error) {
      const caughtError =
        error instanceof Error ? error : new Error(String(error));
      logger.error(
        `Failed deferring chat input interaction ${interaction.commandName}\n${caughtError.stack ?? caughtError.message}`,
        { guildId: interaction.guild?.id },
      );
      await interaction.reply({
        content: commandErrors.commandError,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const startedAt = Date.now();
  try {
    await command.execute(interaction);
    trackInteraction(interaction.user.id, {
      command: commandWithSubcommand,
      durationMs: Date.now() - startedAt,
      module: getCommandModule(interaction.commandName),
      outcome: 'ok',
      surface: getSurface(interaction.guildId),
      type: 'chat',
    });
  } catch (error) {
    const caughtError =
      error instanceof Error ? error : new Error(String(error));
    logger.error(
      `Failed executing chat input command ${inlineCode(commandWithSubcommand)}\n${caughtError.stack ?? caughtError.message}`,
      { guildId: interaction.guild?.id },
    );
    const errorMessage = isMissingPermissionsError(caughtError)
      ? commandErrors.botMissingPermissions
      : commandErrors.commandError;
    await (interaction.deferred || interaction.replied
      ? interaction.editReply(errorMessage)
      : interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        }));
    trackInteraction(interaction.user.id, {
      command: commandWithSubcommand,
      durationMs: Date.now() - startedAt,
      errorType: errorName(caughtError),
      module: getCommandModule(interaction.commandName),
      outcome: 'error',
      surface: getSurface(interaction.guildId),
      type: 'chat',
    });
  }
};
