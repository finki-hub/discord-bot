import {
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  DiscordAPIError,
  inlineCode,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
  type RepliableInteraction,
  type UserContextMenuCommandInteraction,
} from 'discord.js';

import { getFullCommandName } from '@/common/commands/utils.js';
import { logger } from '@/common/logger/index.js';
import { getMemberFromGuild } from '@/common/utils/guild.js';
import { name as chatCommandId } from '@/modules/chat/commands/chat/chat.js';
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
import {
  getAutocompleteCommand,
  getButtonCommand,
  getChatCommand,
  getContextMenuCommand,
} from './modules.js';

const nonDeferredCommands = new Set<string>([
  `${chatCommandId} thread`,
  `${ticketCommandId} list`,
  helpCommandId,
  listCommandId,
  listCommandsButtonId,
  listLinksButtonId,
  listQuestionsButtonId,
  ticketListButtonId,
]);

const isExpectedAutocompleteError = (error: unknown): boolean => {
  const message = Error.isError(error) ? error.message : String(error);
  return (
    message.includes('already been acknowledged') ||
    message.includes('Unknown interaction')
  );
};

const isMissingPermissionsError = (error: unknown): boolean =>
  error instanceof DiscordAPIError &&
  (error.code === 50_001 ||
    error.code === 50_013 ||
    error.message.includes('Missing Permissions') ||
    error.message.includes('Missing Access'));

const notifyInteractionError = async (
  interaction: RepliableInteraction,
  errorMessage: string,
) => {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: errorMessage });
    } else {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch {
    // Notifying the user can fail if the interaction expired; ignore it.
  }
};

export const handleChatInputCommand = async (
  interaction: ChatInputCommandInteraction,
) => {
  const commandWithSubcommand = getFullCommandName(interaction);

  logger.info(
    `[Chat] ${interaction.user.tag}: ${commandWithSubcommand} [${interaction.guild?.name ?? 'DM'}]`,
  );

  const command = getChatCommand(interaction.commandName);

  if (command === undefined) {
    logger.warn(
      `Command for interaction ${interaction.commandName} not found`,
      {
        guildId: interaction.guild?.id,
      },
    );
    await interaction.reply({
      content: commandErrors.commandError,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const member =
    interaction.guild === null
      ? null
      : await getMemberFromGuild(interaction.user.id, interaction.guild);

  if (member === null) {
    if (commandRequiresPermissions(commandWithSubcommand)) {
      logger.warn('Guild-only command used in DMs', {
        guildId: interaction.guild?.id,
      });
      await interaction.reply({
        content: commandErrors.commandGuildOnly,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  } else if (!(await hasCommandPermission(member, commandWithSubcommand))) {
    await interaction.reply({
      content: commandErrors.commandNoPermission,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  if (
    !nonDeferredCommands.has(commandWithSubcommand) &&
    !nonDeferredCommands.has(interaction.commandName)
  ) {
    try {
      await interaction.deferReply();
    } catch (error) {
      logger.error(
        `Failed deferring chat input interaction ${interaction.commandName}\n${String(error)}`,
        {
          guildId: interaction.guild?.id,
        },
      );
      await interaction.reply({
        content: commandErrors.commandError,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(
      `Failed executing chat input command ${inlineCode(commandWithSubcommand)}\n${String(error)}`,
      { guildId: interaction.guild?.id },
    );

    const errorMessage = isMissingPermissionsError(error)
      ? commandErrors.botMissingPermissions
      : commandErrors.commandError;

    await (interaction.deferred || interaction.replied
      ? interaction.editReply(errorMessage)
      : interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        }));
  }
};

export const handleButton = async (interaction: ButtonInteraction) => {
  logger.info(
    `[Button] ${interaction.user.tag}: ${interaction.customId} [${interaction.guild?.name ?? 'DM'}]`,
  );

  const [commandName, ...args] = interaction.customId.split(':');

  if (!commandName) {
    logger.error(`Command for interaction ${interaction.id} not found`, {
      guildId: interaction.guild?.id,
    });
    await interaction.reply({
      content: commandErrors.commandError,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const command = getButtonCommand(commandName);

  if (command === undefined) {
    logger.error(`Command for interaction ${interaction.id} not found`, {
      guildId: interaction.guild?.id,
    });
    await interaction.reply({
      content: commandErrors.commandError,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const member =
    interaction.guild === null
      ? null
      : await getMemberFromGuild(interaction.user.id, interaction.guild);

  if (member === null) {
    if (commandRequiresPermissions(command.name)) {
      logger.warn('Guild-only command used in DMs', {
        guildId: interaction.guild?.id,
      });
      await interaction.reply({
        content: commandErrors.commandGuildOnly,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  } else if (!(await hasCommandPermission(member, command.name))) {
    await interaction.reply({
      content: commandErrors.commandNoPermission,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  try {
    if (!nonDeferredCommands.has(command.name)) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await command.execute(interaction, args);
  } catch (error) {
    logger.error(
      `Failed executing button interaction ${interaction.customId}\n${String(error)}`,
      {
        guildId: interaction.guild?.id,
      },
    );

    const errorMessage = isMissingPermissionsError(error)
      ? commandErrors.botMissingPermissions
      : commandErrors.commandError;

    await notifyInteractionError(interaction, errorMessage);
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
    try {
      await interaction.respond([]);
    } catch {
      // Autocomplete responses fail silently if the interaction expired.
    }

    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    if (!isExpectedAutocompleteError(error)) {
      logger.error(
        `Failed executing autocomplete interaction ${interaction.commandName}\n${String(error)}`,
        {
          guildId: interaction.guild?.id,
        },
      );
    }
  } finally {
    try {
      await interaction.respond([]);
    } catch {
      // Autocomplete responses fail silently if the interaction expired.
    }
  }
};

const executeContextMenuCommand = async (
  interaction:
    | MessageContextMenuCommandInteraction
    | UserContextMenuCommandInteraction,
  logPrefix: string,
) => {
  logger.info(
    `${logPrefix} ${interaction.user.tag}: ${interaction.commandName} [${interaction.guild?.name ?? 'DM'}]`,
  );

  const command = getContextMenuCommand(interaction.commandName);

  if (command === undefined) {
    logger.warn(
      `Command for interaction ${interaction.commandName} not found`,
      {
        guildId: interaction.guild?.id,
      },
    );
    await interaction.reply({
      content: commandErrors.commandError,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const member =
    interaction.guild === null
      ? null
      : await getMemberFromGuild(interaction.user.id, interaction.guild);

  if (member === null) {
    if (commandRequiresPermissions(interaction.commandName)) {
      logger.warn('Guild-only command used in DMs', {
        guildId: interaction.guild?.id,
      });
      await interaction.reply({
        content: commandErrors.commandGuildOnly,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  } else if (!(await hasCommandPermission(member, interaction.commandName))) {
    await interaction.reply({
      content: commandErrors.commandNoPermission,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  try {
    if (!nonDeferredCommands.has(command.name)) {
      await interaction.deferReply();
    }

    await command.execute(interaction);
  } catch (error) {
    logger.error(
      `Failed executing context menu command ${inlineCode(interaction.commandName)}\n${String(error)}`,
      {
        guildId: interaction.guild?.id,
      },
    );

    const errorMessage = isMissingPermissionsError(error)
      ? commandErrors.botMissingPermissions
      : commandErrors.commandError;

    await (interaction.deferred || interaction.replied
      ? interaction.editReply({
          content: errorMessage,
        })
      : interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        }));
  }
};

export const handleUserContextMenuCommand = (
  interaction: UserContextMenuCommandInteraction,
) => executeContextMenuCommand(interaction, '[User Context]');

export const handleMessageContextMenuCommand = (
  interaction: MessageContextMenuCommandInteraction,
) => executeContextMenuCommand(interaction, '[Message Context]');

export const handleModalSubmit = async (
  interaction: ModalSubmitInteraction,
) => {
  logger.info(
    `[Modal] ${interaction.user.tag}: ${interaction.customId} [${interaction.guild?.name ?? 'DM'}]`,
  );
  logger.warn(
    `Received unhandled modal submit interaction: ${interaction.customId}`,
    {
      guildId: interaction.guild?.id,
    },
  );
  await interaction.reply({
    content: commandErrors.commandError,
    flags: MessageFlags.Ephemeral,
  });
};
