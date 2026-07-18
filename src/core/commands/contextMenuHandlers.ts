import {
  inlineCode,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { trackInteraction } from '@/common/services/analytics.js';
import { commandErrors } from '@/translations/commands.js';

import {
  errorName,
  getSurface,
  hasInteractionCommandPermission,
  isMissingPermissionsError,
  notifyInteractionError,
  notifyMissingApplicationCommand,
  shouldDeferCommand,
} from './interactionHandlerUtils.js';
import { getCommandModule, getContextMenuCommand } from './modules.js';

type ContextMenuInteraction =
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

const executeContextMenuCommand = async (
  interaction: ContextMenuInteraction,
  logPrefix: string,
) => {
  logger.info(
    `${logPrefix} ${interaction.user.tag}: ${interaction.commandName} [${interaction.guild?.name ?? 'DM'}]`,
  );
  const command = getContextMenuCommand(interaction.commandName);
  if (command === undefined) {
    await notifyMissingApplicationCommand(interaction, interaction.commandName);
    return;
  }
  if (
    !(await hasInteractionCommandPermission(
      interaction,
      interaction.commandName,
    ))
  ) {
    return;
  }

  const startedAt = Date.now();
  try {
    if (shouldDeferCommand(command.name)) {
      await interaction.deferReply();
    }
    await command.execute(interaction);
    trackInteraction(interaction.user.id, {
      command: interaction.commandName,
      durationMs: Date.now() - startedAt,
      module: getCommandModule(interaction.commandName),
      outcome: 'ok',
      surface: getSurface(interaction.guildId),
      type: 'context',
    });
  } catch (error) {
    const caughtError =
      error instanceof Error ? error : new Error(String(error));
    logger.error(
      `Failed executing context menu command ${inlineCode(interaction.commandName)}\n${caughtError.stack ?? caughtError.message}`,
      { guildId: interaction.guild?.id },
    );
    const errorMessage = isMissingPermissionsError(caughtError)
      ? commandErrors.botMissingPermissions
      : commandErrors.commandError;
    await notifyInteractionError(interaction, errorMessage);
    trackInteraction(interaction.user.id, {
      command: interaction.commandName,
      durationMs: Date.now() - startedAt,
      errorType: errorName(caughtError),
      module: getCommandModule(interaction.commandName),
      outcome: 'error',
      surface: getSurface(interaction.guildId),
      type: 'context',
    });
  }
};

export const handleUserContextMenuCommand = (
  interaction: UserContextMenuCommandInteraction,
) => executeContextMenuCommand(interaction, '[User Context]');

export const handleMessageContextMenuCommand = (
  interaction: MessageContextMenuCommandInteraction,
) => executeContextMenuCommand(interaction, '[Message Context]');
