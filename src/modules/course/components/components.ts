import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  SeparatorSpacingSize,
} from 'discord.js';

import { labels } from '@/translations/labels.js';

import { type Course } from '../schemas/Course.js';
import { extractParticipants, getRetiredStaff, linkStaff } from './utils.js';

const addCurriculumSection = (
  containerBuilder: ContainerBuilder,
  course: Course,
  year: '2018' | '2023',
) => {
  const code = course[`${year}-code`];
  const level = course[`${year}-level`];
  const semester = course[`${year}-semester`];
  const prerequisite = course[`${year}-prerequisite`];

  containerBuilder
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        heading(`${labels.accreditation} ${year}`, HeadingLevel.Three),
      ),
    )
    .addSeparatorComponents((separator) => separator.setDivider(false))
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.code}:** ${code ?? '-'}`),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.level}:** ${level ?? '-'}`),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.semester}:** ${semester ?? '-'}`),
    );

  if (prerequisite !== undefined) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.prerequisite}:** ${prerequisite}`),
    );
  }

  if (code !== undefined) {
    containerBuilder
      .addSeparatorComponents((separator) => separator.setDivider(false))
      .addActionRowComponents((actionRow) =>
        actionRow.addComponents(
          new ButtonBuilder()
            .setLabel(labels.accreditation)
            .setURL(`https://finki.ukim.mk/subject/${code}`)
            .setStyle(ButtonStyle.Link),
        ),
      );
  }
};

const addUnavailableSection = (
  containerBuilder: ContainerBuilder,
  year: '2018' | '2023',
) => {
  containerBuilder
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        heading(`${labels.accreditation} ${year}`, HeadingLevel.Three),
      ),
    )
    .addSeparatorComponents((separator) => separator.setDivider(false))
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`> :x: ${labels.notAvailable}`),
    );
};

export const getCourseComponent = (course: Course) => {
  const containerBuilder = new ContainerBuilder();

  containerBuilder.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(heading(course.name, HeadingLevel.Two)),
  );

  containerBuilder.addSeparatorComponents((separator) =>
    separator.setSpacing(SeparatorSpacingSize.Large),
  );

  if (course['2023-available']) {
    addCurriculumSection(containerBuilder, course, '2023');
  } else {
    addUnavailableSection(containerBuilder, '2023');
  }

  containerBuilder.addSeparatorComponents((separator) =>
    separator.setSpacing(SeparatorSpacingSize.Large),
  );

  if (course['2018-available']) {
    addCurriculumSection(containerBuilder, course, '2018');
  } else {
    addUnavailableSection(containerBuilder, '2018');
  }

  containerBuilder
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        heading(`**${labels.staff}**`, HeadingLevel.Three),
      ),
    )
    .addSeparatorComponents((separator) => separator.setDivider(false))
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        `**${labels.professors}**\n${linkStaff(course.professors)}`,
      ),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        `**${labels.assistants}**\n${linkStaff(course.assistants)}`,
      ),
    );

  const retiredText = getRetiredStaff(
    course.professors,
    course.assistants,
  );

  if (retiredText) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        `**${labels.retired}**\n${retiredText}`,
      ),
    );
  }

  const participants = extractParticipants(course);

  if (participants.length > 0) {
    containerBuilder
      .addSeparatorComponents((separator) =>
        separator.setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(
          heading(labels.enrolledStudents, HeadingLevel.Three),
        ),
      )
      .addSeparatorComponents((separator) => separator.setDivider(false));

    for (let i = 0; i < participants.length; i += 3) {
      const chunk = participants.slice(i, i + 3);
      const participantText = chunk
        .map(({ count, year }) => `**${year}:** ${count}`)
        .join('  •  ');

      containerBuilder.addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(participantText),
      );
    }
  }

  return containerBuilder;
};
