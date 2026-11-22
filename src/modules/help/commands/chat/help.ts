import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getMemberFromGuild } from '@/common/utils/guild.js';
import { safeEphemeralReplyToInteraction } from '@/common/utils/messages.js';
import {
  commandRequiresPermissions,
  getCommandsWithPermission,
} from '@/core/utils/permissions.js';
import { getListCommandsComponent } from '@/modules/list/components/components.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'help';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = async (interaction: ChatInputCommandInteraction) => {
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

  await interaction.editReply({
    components: [getListCommandsComponent(commands, 0)],
    flags: MessageFlags.IsComponentsV2,
  });
};
