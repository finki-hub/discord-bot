import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  heading,
  HeadingLevel,
  SeparatorSpacingSize,
} from 'discord.js';

import type { PaginationComponentData } from '@/common/types/PaginationComponentData.js';

import { MAX_ACTION_ROW_BUTTONS } from '@/common/utils/limits.js';
import { paginationStringFunctions } from '@/translations/pagination.js';

// The pages a row of buttons offers: all of them when they fit, otherwise
// the first, the last and the ones around the current page. One row keeps
// the card within Discord's component limit however long the list is.
const visiblePages = (currentPage: number, totalPages: number) =>
  totalPages <= MAX_ACTION_ROW_BUTTONS
    ? Array.from({ length: totalPages }, (_, page) => page)
    : [
        ...new Set([
          0,
          currentPage,
          Math.max(currentPage - 1, 0),
          Math.min(currentPage + 1, totalPages - 1),
          totalPages - 1,
        ]),
      ].toSorted((left, right) => left - right);

const buildPageButtons = (
  buttonId: string,
  currentPage: number,
  totalPages: number,
) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    visiblePages(currentPage, totalPages).map((page) =>
      new ButtonBuilder()
        .setCustomId(`${buttonId}:page:${page}`)
        .setLabel(`${page + 1}`)
        .setStyle(
          page === currentPage ? ButtonStyle.Primary : ButtonStyle.Secondary,
        )
        .setDisabled(page === currentPage),
    ),
  );

const addEntries = (
  containerBuilder: ContainerBuilder,
  paginatedEntries: string[],
  description: string | undefined,
) => {
  if (paginatedEntries.length === 0) {
    return;
  }

  if (description !== undefined) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(description),
    );
  }

  containerBuilder.addSeparatorComponents((separator) =>
    separator.setDivider(false),
  );

  for (const entry of paginatedEntries) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(entry),
    );
  }

  containerBuilder.addSeparatorComponents((separator) =>
    separator.setSpacing(SeparatorSpacingSize.Large),
  );
};

export const getPaginationComponent = ({
  buttonId,
  description,
  entries,
  entriesLabel,
  page,
  pageSize,
  title,
}: PaginationComponentData) => {
  const totalPages = Math.ceil(entries.length / pageSize);
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));

  const containerBuilder = new ContainerBuilder();

  containerBuilder
    .addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(heading(title, HeadingLevel.Two)),
    )
    .addSeparatorComponents((separator) =>
      separator.setSpacing(SeparatorSpacingSize.Large),
    );

  const paginatedEntries = entries.slice(
    pageSize * currentPage,
    pageSize * (currentPage + 1),
  );

  if (paginatedEntries.length === 0) {
    containerBuilder.addTextDisplayComponents((textDisplay) =>
      textDisplay.setContent(paginationStringFunctions.noEntries(entriesLabel)),
    );

    return containerBuilder;
  }

  addEntries(containerBuilder, paginatedEntries, description);

  if (totalPages > 1) {
    containerBuilder
      .addActionRowComponents(
        buildPageButtons(buttonId, currentPage, totalPages),
      )
      .addSeparatorComponents((separator) => separator.setDivider(false));
  }

  containerBuilder.addTextDisplayComponents((textDisplay) =>
    textDisplay.setContent(
      paginationStringFunctions.footer({
        label: entriesLabel,
        page: currentPage + 1,
        pages: Math.max(1, totalPages),
        total: entries.length,
      }),
    ),
  );

  return containerBuilder;
};
