import {
  channelMention,
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { getMentionComponent } from '@/common/components/mention.js';
import { getCourseComponent } from '@/modules/course/components/components.js';
import { getCourse } from '@/modules/course/utils/data.js';
import { getCourseDetails, nameKey } from '@/modules/course/utils/details.js';
import { getClosestCourse } from '@/modules/course/utils/search.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

export const name = 'course';

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription(commandDescriptions[name])
  .addStringOption((option) =>
    option
      .setName('course')
      .setDescription('Предмет')
      .setRequired(true)
      .setAutocomplete(true),
  )
  .addUserOption((option) =>
    option.setName('user').setDescription('Корисник').setRequired(false),
  );

// The course's channels on this server, as mentions. Directus keeps a
// channel's name ("КМиБ / КМ"); Discord lowercases a text channel's name
// and joins its words with dashes ("кмиб-км"), so both compare by words.
const channelMentions = (guild: Guild | null, names: string[]) =>
  names.flatMap((name) => {
    const wanted = nameKey(name);
    const channel = guild?.channels.cache.find(
      (candidate) =>
        candidate.type === ChannelType.GuildText &&
        nameKey(candidate.name) === wanted,
    );

    return channel ? [channelMention(channel.id)] : [];
  });

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const courseName = interaction.options.getString('course');

  if (courseName === null) {
    await interaction.editReply(commandErrors.courseNotFound);
    return;
  }

  const closestCourseName = getClosestCourse(courseName);

  if (closestCourseName === null) {
    await interaction.editReply(commandErrors.courseNotFound);
    return;
  }

  const course = getCourse(closestCourseName);

  if (course === undefined) {
    await interaction.editReply(commandErrors.courseNotFound);
    return;
  }

  const details = await getCourseDetails(course.name);
  const user = interaction.options.getUser('user');

  await interaction.editReply({
    components: [
      ...(user ? [getMentionComponent(user)] : []),
      getCourseComponent(course, {
        channels: channelMentions(interaction.guild, details?.channels ?? []),
        unlocks: details?.unlocks ?? [],
      }),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
};
