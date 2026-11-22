import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { safeEphemeralReplyToInteraction } from '@/common/utils/messages.js';
import { getQuestions } from '@/modules/faq/utils/api.js';
import { getListQuestionsComponent } from '@/modules/list/components/components.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'questions';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name]);

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const questions = await getQuestions();

  if (questions === null) {
    await safeEphemeralReplyToInteraction(
      interaction,
      commandErrors.questionsFetchFailed,
    );

    return;
  }

  await interaction.editReply({
    components: [getListQuestionsComponent(questions, 0)],
    flags: MessageFlags.IsComponentsV2,
  });
};
