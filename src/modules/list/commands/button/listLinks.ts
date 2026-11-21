import { type ButtonInteraction, MessageFlags } from 'discord.js';

import type { Link } from '@/modules/faq/schemas/Link.js';

import {
  handlePagination,
  verifyPaginationInteraction,
} from '@/common/utils/pagination.js';
import { getLinks } from '@/modules/faq/utils/api.js';
import { getListLinksComponent } from '@/modules/list/components/components.js';
import { commandErrors } from '@/translations/commands.js';

export const name = 'listLinks';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  if (!(await verifyPaginationInteraction(interaction))) {
    return;
  }

  await interaction.deferUpdate();

  const links = await getLinks();

  if (links === null) {
    await interaction.followUp({
      content: commandErrors.linksFetchFailed,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await handlePagination<Link>({
    entries: links,
    getComponent: getListLinksComponent,
    interaction,
    paginationArguments: args,
  });
};
