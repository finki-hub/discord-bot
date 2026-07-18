import { type ClientEvents, Events } from 'discord.js';

import { logger } from '@/common/logger/index.js';

import { handleAutocomplete } from '../commands/autocompleteHandler.js';
import {
  handleButton,
  handleModalSubmit,
} from '../commands/componentHandlers.js';
import {
  handleMessageContextMenuCommand,
  handleUserContextMenuCommand,
} from '../commands/contextMenuHandlers.js';
import { handleChatInputCommand } from '../commands/handlers.js';

export const name = Events.InteractionCreate;

export const execute = async (...[interaction]: ClientEvents[typeof name]) => {
  if (interaction.isChatInputCommand()) {
    await handleChatInputCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  } else if (interaction.isUserContextMenuCommand()) {
    await handleUserContextMenuCommand(interaction);
  } else if (interaction.isMessageContextMenuCommand()) {
    await handleMessageContextMenuCommand(interaction);
  } else if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  } else {
    logger.warn(`Unknown interaction from ${interaction.user.id}`, {
      guildId: interaction.guild?.id,
    });
  }
};
