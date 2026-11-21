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

// Discord allows 40 components in a message, nested ones included, so the
// lines of a section share one text display.
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
      textDisplay.setContent(
        [
          `**${labels.name}:** ${name ?? '-'}`,
          `**${labels.code}:** ${code ?? '-'}`,
          `**${labels.level}:** ${level ?? '-'}`,
          `**${labels.semester}:** ${semester ?? '-'}`,
          ...(prerequisite === undefined
            ? []
            : [`**${labels.prerequisite}:** ${prerequisite}`]),
        ].join('\n'),
      ),
    );

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

const addAccreditationSections = (
  containerBuilder: ContainerBuilder,
  course: Course,
) => {
  for (const year of ACCREDITATION_YEARS) {
    containerBuilder.addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    );

    if (course[`${year}-available`]) {
      addCurriculumSection(containerBuilder, course, year);
    } else {
      addUnavailableSection(containerBuilder, year);
    }
  }
};

const addMastersSection = (containerBuilder: ContainerBuilder) => {
  containerBuilder
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(heading(labels.mastersCourse, HeadingLevel.Three)),
    )
    .addSeparatorComponents((separator) => separator.setDivider(false))
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`> ${labels.mastersCourseNote}`),
    );
};

// The most courses "Предуслов за" names before "+N".
const UNLOCKS_SHOWN = 15;

// What the card shows beside courses.json: the course's channels on this
// server (as mentions) and the courses whose prerequisites name it.
export type CourseExtras = {
  channels?: string[];
  unlocks?: string[];
};

const unlocksText = (unlocks: string[]) => {
  const shown = unlocks.slice(0, UNLOCKS_SHOWN).join(', ');
  const rest = unlocks.length - UNLOCKS_SHOWN;

  return rest > 0 ? `${shown} (+${rest})` : shown;
};

export const getCourseComponent = (
  course: Course,
  extras: CourseExtras = {},
) => {
  const containerBuilder = new ContainerBuilder();

  containerBuilder.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(heading(course.name, HeadingLevel.Two)),
  );

  if (extras.channels && extras.channels.length > 0) {
    const channels = extras.channels.join(' ');

    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(`**${labels.channel}:** ${channels}`),
    );
  }

  // A master's course (cycle "second") is in no undergraduate
  // accreditation: say so instead of two unavailable sections.
  if (course['cycle'] === 'second') {
    addMastersSection(containerBuilder);
  } else {
    addAccreditationSections(containerBuilder, course);
  }

  if (extras.unlocks && extras.unlocks.length > 0) {
    const unlocks = unlocksText(extras.unlocks);

    containerBuilder
      .addSeparatorComponents((separator) =>
        separator.setSpacing(SeparatorSpacingSize.Large),
      )
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(
          heading(labels.prerequisiteFor, HeadingLevel.Three),
        ),
      )
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(unlocks),
      );
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

    const participantLines: string[] = [];

    for (let i = 0; i < participants.length; i += 3) {
      participantLines.push(
        participants
          .slice(i, i + 3)
          .map(({ count, year }) => `**${year}:** ${count}`)
          .join('  •  '),
      );
    }

    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(participantLines.join('\n')),
    );
  }

  return containerBuilder;
};
