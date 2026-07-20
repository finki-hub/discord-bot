import {
  type ButtonInteraction,
  MessageFlags,
  type ModalSubmitInteraction,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { trackInteraction } from '@/common/services/analytics.js';
import { commandErrors } from '@/translations/commands.js';

import type { ButtonCommand, ModalCommand } from '../lib/Command.js';

import {
  errorName,
  getSurface,
  hasInteractionCommandPermission,
  isMissingPermissionsError,
  notifyInteractionError,
  shouldDeferCommand,
} from './interactionHandlerUtils.js';
import {
  getButtonCommand,
  getCommandModule,
  getModalCommand,
} from './modules.js';

type ComponentCommand<Interaction extends ComponentInteraction> = {
  readonly execute: (interaction: Interaction, args: string[]) => Promise<void>;
  readonly name: string;
};
type ComponentExecution<Interaction extends ComponentInteraction> = {
  readonly args: string[];
  readonly command: ComponentCommand<Interaction>;
  readonly deferReply: boolean;
  readonly failureDescription: string;
  readonly interaction: Interaction;
  readonly type: ComponentInteractionType;
};
type ComponentInteraction = ButtonInteraction | ModalSubmitInteraction;
type ComponentInteractionType = 'button' | 'modal';

const notifyMissingComponentCommand = async (
  interaction: ComponentInteraction,
  type: ComponentInteractionType,
) => {
  logger.error(`Command for ${type} interaction ${interaction.id} not found`, {
    guildId: interaction.guild?.id,
  });
  await interaction.reply({
    content: commandErrors.commandError,
    flags: MessageFlags.Ephemeral,
  });
};

const executeComponentCommand = async <
  Interaction extends ComponentInteraction,
>({
  args,
  command,
  deferReply,
  failureDescription,
  interaction,
  type,
}: ComponentExecution<Interaction>) => {
  if (!(await hasInteractionCommandPermission(interaction, command.name))) {
    return;
  }

  const startedAt = Date.now();
  try {
    if (deferReply) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }
    await command.execute(interaction, args);
    trackInteraction(interaction.user.id, {
      command: command.name,
      durationMs: Date.now() - startedAt,
      module: getCommandModule(command.name),
      outcome: 'ok',
      surface: getSurface(interaction.guildId),
      type,
    });
  } catch (error) {
    const caughtError =
      error instanceof Error ? error : new Error(String(error));
    logger.error(
      `Failed executing ${failureDescription}\n${caughtError.stack ?? caughtError.message}`,
      { guildId: interaction.guild?.id },
    );
    const errorMessage = isMissingPermissionsError(caughtError)
      ? commandErrors.botMissingPermissions
      : commandErrors.commandError;
    await notifyInteractionError(interaction, errorMessage);
    trackInteraction(interaction.user.id, {
      command: command.name,
      durationMs: Date.now() - startedAt,
      errorType: errorName(caughtError),
      module: getCommandModule(command.name),
      outcome: 'error',
      surface: getSurface(interaction.guildId),
      type,
    });
  }
};

export const handleButton = async (interaction: ButtonInteraction) => {
  logger.info(
    `[Button] ${interaction.user.tag}: ${interaction.customId} [${interaction.guild?.name ?? 'DM'}]`,
  );
  const [commandName, ...args] = interaction.customId.split(':');
  const command: ButtonCommand | undefined = commandName
    ? getButtonCommand(commandName)
    : undefined;
  if (command === undefined) {
    await notifyMissingComponentCommand(interaction, 'button');
    return;
  }
  await executeComponentCommand({
    args,
    command,
    deferReply: shouldDeferCommand(command.name),
    failureDescription: `button interaction ${interaction.customId}`,
    interaction,
    type: 'button',
  });
};

export const handleModalSubmit = async (
  interaction: ModalSubmitInteraction,
) => {
  logger.info(
    `[Modal] ${interaction.user.tag}: ${interaction.customId} [${interaction.guild?.name ?? 'DM'}]`,
  );
  const [commandName, ...args] = interaction.customId.split(':');
  const command: ModalCommand | undefined = commandName
    ? getModalCommand(commandName)
    : undefined;
  if (command === undefined) {
    await notifyMissingComponentCommand(interaction, 'modal');
    return;
  }
  await executeComponentCommand({
    args,
    command,
    deferReply: false,
    failureDescription: `modal submit interaction ${interaction.customId}`,
    interaction,
    type: 'modal',
  });
};
