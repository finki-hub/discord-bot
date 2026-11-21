import {
  type ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  hyperlink,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getMentionComponent } from '@/common/components/mention.js';
import { MAX_COMPONENT_TEXT_LENGTH } from '@/common/utils/limits.js';
import { safeReplyToInteraction } from '@/common/utils/messages.js';
import {
  commandDescriptions,
  commandErrors,
  commandResponseFunctions,
} from '@/translations/commands.js';

import {
  getQuestionComponent,
  MAX_LINK_BUTTONS,
} from '../components/components.js';
import { getButtonLinks, getNormalizedUrl } from './links.js';
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

    const title = heading(question.name, HeadingLevel.Two);
    const mention = user ? commandResponseFunctions.commandFor(user.id) : '';

    if (
      title.length + question.content.length + mention.length >
        MAX_COMPONENT_TEXT_LENGTH ||
      getButtonLinks(question.links).length > MAX_LINK_BUTTONS
    ) {
      const links = Object.entries(question.links ?? {})
        .filter(([name, url]) => name !== '' && url !== '')
        .map(([name, url]) => hyperlink(name, getNormalizedUrl(url)))
        .join('\n');

      await safeReplyToInteraction(
        interaction,
        [mention, title, question.content, links].filter(Boolean).join('\n\n'),
        { mentionUserIds: user ? [user.id] : [] },
      );

      return;
    }

    await interaction.editReply({
      allowedMentions: {
        parse: [],
        users: user ? [user.id] : [],
      },
      components: [
        ...(user ? [getMentionComponent(user)] : []),
        getQuestionComponent(question),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
});
