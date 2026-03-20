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

import { paginationStringFunctions } from '@/translations/pagination.js';

const buildPageButtons = (
  buttonId: string,
  currentPage: number,
  totalPages: number,
) => {
  const rows: Array<ActionRowBuilder<ButtonBuilder>> = [];

  for (let i = 0; i < totalPages; i += 5) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();

    for (let j = i; j < Math.min(i + 5, totalPages); j++) {
      const style =
        j === currentPage ? ButtonStyle.Primary : ButtonStyle.Secondary;

      const button = new ButtonBuilder()
        .setCustomId(`${buttonId}:page:${j}`)
        .setLabel(`${j + 1}`)
        .setStyle(style)
        .setDisabled(j === currentPage);

      actionRow.addComponents(button);
    }

    rows.push(actionRow);
  }

  return rows;
};

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
    for (const row of buildPageButtons(buttonId, currentPage, totalPages)) {
      containerBuilder.addActionRowComponents(row);
    }

    containerBuilder.addSeparatorComponents((separator) =>
      separator.setDivider(false),
    );
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
