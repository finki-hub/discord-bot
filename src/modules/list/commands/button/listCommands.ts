import { type ButtonInteraction, MessageFlags } from 'discord.js';

import { getMemberFromGuild } from '@/common/utils/guild.js';
import {
  handlePagination,
  verifyPaginationInteraction,
} from '@/common/utils/pagination.js';
import {
  commandRequiresPermissions,
  getCommandsWithPermission,
} from '@/core/utils/permissions.js';
import { getListCommandsComponent } from '@/modules/list/components/components.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'listCommands';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  if (!(await verifyPaginationInteraction(interaction))) {
    return;
  }

  await interaction.deferUpdate();

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
      await interaction.followUp({
        content: commandErrors.commandGuildOnly,
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    commands = await getCommandsWithPermission(member);
  }

  await handlePagination<string>({
    entries: commands,
    getComponent: getListCommandsComponent,
    interaction,
    paginationArguments: args,
  });
};
