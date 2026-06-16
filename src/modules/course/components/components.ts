import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  SeparatorSpacingSize,
} from 'discord.js';

import { labels } from '@/translations/labels.js';

import { ACCREDITATION_YEARS, type AccreditationYear } from '../constants.js';
import { type Course } from '../schemas/Course.js';
import { extractParticipants, getRetiredStaff, linkStaff } from './utils.js';

const addCurriculumSection = (
  containerBuilder: ContainerBuilder,
  course: Course,
  year: AccreditationYear,
) => {
  const name = course[`${year}-name`];
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
      textDisplay.setContent(`**${labels.name}:** ${name ?? '-'}`),
    )
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
  year: AccreditationYear,
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

  for (const year of ACCREDITATION_YEARS) {
    containerBuilder.addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    );

    const isAvailable = course[`${year}-available`];

    if (isAvailable) {
      addCurriculumSection(containerBuilder, course, year);
    } else {
      addUnavailableSection(containerBuilder, year);
    }
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
    .addSeparatorComponents((separator) => separator.setDivider(false));

  const professorChunks = linkStaff(course.professors);

  containerBuilder.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(`**${labels.professors}**\n${professorChunks[0]}`),
  );

  for (const chunk of professorChunks.slice(1)) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(chunk),
    );
  }

  const assistantChunks = linkStaff(course.assistants);

  containerBuilder.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(`**${labels.assistants}**\n${assistantChunks[0]}`),
  );

  for (const chunk of assistantChunks.slice(1)) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(chunk),
    );
  }

  const retiredChunks = getRetiredStaff(course.professors, course.assistants);

  if (retiredChunks.length > 0) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(
        `**${labels.retiredPlural}**\n${retiredChunks[0]}`,
      ),
    );

    for (const chunk of retiredChunks.slice(1)) {
      containerBuilder.addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(chunk),
      );
    }
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
