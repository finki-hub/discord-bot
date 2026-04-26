import { heading, HeadingLevel, hyperlink } from 'discord.js';

import type { Link } from '@/modules/faq/schemas/Link.js';
import type { Question } from '@/modules/faq/schemas/Question.js';

import { getCommandMention } from '@/common/commands/utils.js';
import { getPaginationComponent } from '@/common/components/pagination.js';
import { getNormalizedUrl } from '@/modules/faq/utils/links.js';
import { commandDescriptions } from '@/translations/commands.js';
import {
  componentMessageFunctions,
  componentMessages,
} from '@/translations/components.js';
import { labels } from '@/translations/labels.js';

import {
  COMMANDS_PER_PAGE,
  LINKS_PER_PAGE,
  QUESTIONS_PER_PAGE,
} from '../utils/constants.js';

const LIST_COMMANDS_BUTTON_ID = 'listCommands';
const LIST_LINKS_BUTTON_ID = 'listLinks';
const LIST_QUESTIONS_BUTTON_ID = 'listQuestions';

export const getListCommandsComponent = (commands: string[], page: number) =>
  getPaginationComponent({
    buttonId: LIST_COMMANDS_BUTTON_ID,
    description: componentMessages.allCommands,
    entries: commands.map(
      (command) =>
        `${getCommandMention(command)}\n${commandDescriptions[command as keyof typeof commandDescriptions]}`,
    ),
    entriesLabel: labels.commands,
    page,
    pageSize: COMMANDS_PER_PAGE,
    title: labels.commands,
  });

export const getListLinksComponent = (links: Link[], page: number) =>
  getPaginationComponent({
    buttonId: LIST_LINKS_BUTTON_ID,
    description: componentMessageFunctions.allLinks(getCommandMention('link')),
    entries: links.map((link) =>
      heading(
        hyperlink(link.name, getNormalizedUrl(link.url)),
        HeadingLevel.Three,
      ),
    ),
    entriesLabel: labels.links,
    page,
    pageSize: LINKS_PER_PAGE,
    title: labels.links,
  });

export const getListQuestionsComponent = (
  questions: Question[],
  page: number,
) =>
  getPaginationComponent({
    buttonId: LIST_QUESTIONS_BUTTON_ID,
    description: componentMessageFunctions.allQuestions(
      getCommandMention('faq'),
    ),
    entries: questions.map((question) =>
      heading(question.name, HeadingLevel.Three),
    ),
    entriesLabel: labels.questions,
    page,
    pageSize: QUESTIONS_PER_PAGE,
    title: labels.questions,
  });
