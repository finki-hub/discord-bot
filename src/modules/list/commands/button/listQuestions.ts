import { type ButtonInteraction, MessageFlags } from 'discord.js';

import type { Question } from '@/modules/faq/schemas/Question.js';

import {
  handlePagination,
  verifyPaginationInteraction,
} from '@/common/utils/pagination.js';
import { getQuestions } from '@/modules/faq/utils/api.js';
import { getListQuestionsComponent } from '@/modules/list/components/components.js';
import { commandErrors } from '@/translations/commands.js';

export const name = 'listQuestions';

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  if (!(await verifyPaginationInteraction(interaction))) {
    return;
  }

  await interaction.deferUpdate();

  const questions = await getQuestions();

  if (questions === null) {
    await interaction.followUp({
      content: commandErrors.questionsFetchFailed,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await handlePagination<Question>({
    entries: questions,
    getComponent: getListQuestionsComponent,
    interaction,
    paginationArguments: args,
  });
};
