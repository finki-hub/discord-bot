import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getMentionComponent } from '@/common/components/mention.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

import { getQuestionComponent } from '../components/components.js';
import { getClosestQuestion } from './search.js';

export const getCommonCommand = (name: keyof typeof commandDescriptions) => ({
  data: new SlashCommandBuilder()
    .setName(name)
    .setDescription(commandDescriptions[name])
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('Прашање')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Корисник').setRequired(false),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const keyword = interaction.options.getString('question', true);
    const user = interaction.options.getUser('user');

    const parsedKeyword = Number(keyword);
    const question = await getClosestQuestion(
      Number.isSafeInteger(parsedKeyword) && parsedKeyword > 0
        ? parsedKeyword
        : keyword,
    );

    if (question === null) {
      await interaction.editReply(commandErrors.faqNotFound);

      return;
    }

    await interaction.editReply({
      components: [
        ...(user ? [getMentionComponent(user)] : []),
        getQuestionComponent(question),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
