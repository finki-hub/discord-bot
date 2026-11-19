import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getMentionComponent } from '@/common/components/mention.js';
import { getStaffComponent } from '@/modules/staff/components/components.js';
import { getConsultations } from '@/modules/staff/utils/consultations.js';
import { getStaff } from '@/modules/staff/utils/data.js';
import { getClosestStaff } from '@/modules/staff/utils/search.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'staff';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name])
  .addStringOption((option) =>
    option
      .setName('professor')
      .setDescription('Професор')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('Корисник').setRequired(false),
  );

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const professor = interaction.options.getString('professor', true);
  const user = interaction.options.getUser('user');

  const closestStaff = getClosestStaff(professor);

  const information = getStaff().find(
    (staff) => staff.name.toLowerCase() === closestStaff?.toLowerCase(),
  );

  if (information === undefined) {
    await interaction.editReply(commandErrors.staffNotFound);

    return;
  }

  const consultations = await getConsultations(information.name);

  await interaction.editReply({
    components: [
      ...(user ? [getMentionComponent(user)] : []),
      getStaffComponent(information, consultations),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
};
