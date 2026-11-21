import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { executeSubcommand } from '@/common/commands/subcommands.js';
import { getMemberFromGuild } from '@/common/utils/guild.js';
import { safeEphemeralReplyToInteraction } from '@/common/utils/messages.js';
import {
  commandRequiresPermissions,
  getCommandsWithPermission,
} from '@/core/utils/permissions.js';
import { getLinks, getQuestions } from '@/modules/faq/utils/api.js';
import {
  getListCommandsComponent,
  getListLinksComponent,
  getListQuestionsComponent,
} from '@/modules/list/components/components.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'list';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('List')
  .addSubcommand((command) =>
    command
      .setName('commands')
      .setDescription(commandDescriptions['list commands']),
  )
  .addSubcommand((command) =>
    command.setName('links').setDescription(commandDescriptions['list links']),
  )
  .addSubcommand((command) =>
    command
      .setName('questions')
      .setDescription(commandDescriptions['list questions']),
  );

export const handleListCommands = async (
  interaction: ChatInputCommandInteraction,
) => {
  let commands: string[];

  if (interaction.guild === null) {
    commands = Object.keys(commandDescriptions).filter(
      (command) => !commandRequiresPermissions(command),
    );
  } else {
    const member = await getMemberFromGuild(
      interaction.user.id,
      interaction.guild,
    );

    if (member === null) {
      await safeEphemeralReplyToInteraction(
        interaction,
        commandErrors.commandNoPermission,
      );

      return;
    }

    commands = await getCommandsWithPermission(member);
  }

  const component = getListCommandsComponent(commands, 0);

  await (interaction.deferred || interaction.replied
    ? interaction.editReply({
        components: [component],
        flags: MessageFlags.IsComponentsV2,
      })
    : interaction.reply({
        components: [component],
        flags: MessageFlags.IsComponentsV2,
      }));
};

const handleListLinks = async (interaction: ChatInputCommandInteraction) => {
  const links = await getLinks();

  if (links === null) {
    await safeEphemeralReplyToInteraction(
      interaction,
      commandErrors.linksFetchFailed,
    );

    return;
  }

  const component = getListLinksComponent(links, 0);

  await (interaction.deferred || interaction.replied
    ? interaction.editReply({
        components: [component],
        flags: MessageFlags.IsComponentsV2,
      })
    : interaction.reply({
        components: [component],
        flags: MessageFlags.IsComponentsV2,
      }));
};

const handleListQuestions = async (
  interaction: ChatInputCommandInteraction,
) => {
  const questions = await getQuestions();

  if (questions === null) {
    await safeEphemeralReplyToInteraction(
      interaction,
      commandErrors.questionsFetchFailed,
    );

    return;
  }

  const component = getListQuestionsComponent(questions, 0);

  await (interaction.deferred || interaction.replied
    ? interaction.editReply({
        components: [component],
        flags: MessageFlags.IsComponentsV2,
      })
    : interaction.reply({
        components: [component],
        flags: MessageFlags.IsComponentsV2,
      }));
};

const listHandlers = {
  commands: handleListCommands,
  links: handleListLinks,
  questions: handleListQuestions,
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await executeSubcommand(interaction, listHandlers);
};
