import {
  DiscordAPIError,
  MessageFlags,
  type RepliableInteraction,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { getMemberFromGuild } from '@/common/utils/guild.js';
import { name as chatFeedbackButtonId } from '@/modules/chat/commands/button/chatFeedback.js';
import { name as chatCommandId } from '@/modules/chat/commands/chat/chat.js';
import { name as credentialsCommandId } from '@/modules/chat/commands/chat/credentials.js';
import { name as helpCommandId } from '@/modules/help/commands/chat/help.js';
import { name as listCommandsButtonId } from '@/modules/list/commands/button/listCommands.js';
import { name as listLinksButtonId } from '@/modules/list/commands/button/listLinks.js';
import { name as listQuestionsButtonId } from '@/modules/list/commands/button/listQuestions.js';
import { name as listCommandId } from '@/modules/list/commands/chat/list.js';
import { name as ticketListButtonId } from '@/modules/ticket/commands/button/ticketList.js';
import { name as ticketCommandId } from '@/modules/ticket/commands/chat/ticket.js';
import { commandErrors } from '@/translations/commands.js';

import {
  commandRequiresPermissions,
  hasCommandPermission,
} from '../utils/permissions.js';

const nonDeferredCommands = new Set<string>([
  `${chatCommandId} models`,
  `${chatCommandId} thread`,
  `${credentialsCommandId} delete`,
  `${credentialsCommandId} list`,
  `${credentialsCommandId} set`,
  `${ticketCommandId} list`,
  chatFeedbackButtonId,
  helpCommandId,
  listCommandId,
  listCommandsButtonId,
  listLinksButtonId,
  listQuestionsButtonId,
  ticketListButtonId,
]);

export const shouldDeferCommand = (...commandNames: string[]): boolean =>
  commandNames.every((commandName) => !nonDeferredCommands.has(commandName));

export const isMissingPermissionsError = (error: unknown): boolean =>
  error instanceof DiscordAPIError &&
  (error.code === 50_001 ||
    error.code === 50_013 ||
    error.message.includes('Missing Permissions') ||
    error.message.includes('Missing Access'));

export const notifyInteractionError = async (
  interaction: RepliableInteraction,
  errorMessage: string,
) => {
  try {
    await (interaction.deferred || interaction.replied
      ? interaction.editReply({ content: errorMessage })
      : interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        }));
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    // Notifying the user can fail if the interaction expired; ignore it.
  }
};

export const notifyMissingApplicationCommand = async (
  interaction: RepliableInteraction,
  commandName: string,
) => {
  logger.warn(`Command for interaction ${commandName} not found`, {
    guildId: interaction.guild?.id,
  });
  await interaction.reply({
    content: commandErrors.commandError,
    flags: MessageFlags.Ephemeral,
  });
};

export const hasInteractionCommandPermission = async (
  interaction: RepliableInteraction,
  commandName: string,
): Promise<boolean> => {
  const member =
    interaction.guild === null
      ? null
      : await getMemberFromGuild(interaction.user.id, interaction.guild);

  if (member === null) {
    if (!commandRequiresPermissions(commandName)) {
      return true;
    }
    logger.warn('Guild-only command used in DMs', {
      guildId: interaction.guild?.id,
    });
    await interaction.reply({
      content: commandErrors.commandGuildOnly,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  if (await hasCommandPermission(member, commandName)) {
    return true;
  }
  await interaction.reply({
    content: commandErrors.commandNoPermission,
    flags: MessageFlags.Ephemeral,
  });
  return false;
};

export const getSurface = (guildId: null | string) =>
  guildId === null ? ('dm' as const) : ('guild' as const);

export const errorName = (error: unknown) =>
  Error.isError(error) ? error.name : 'Error';
