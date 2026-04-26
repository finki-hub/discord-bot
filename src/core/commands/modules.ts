import type { Dirent } from 'node:fs';

import { Collection, REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';

import { logger } from '@/common/logger/index.js';
import { getApplicationId, getToken } from '@/configuration/environment.js';

import {
  type AutocompleteCommand,
  type ButtonCommand,
  type ChatCommand,
  type ContextMenuCommand,
} from '../lib/Command.js';
import { getModules } from '../utils/modules.js';

const chatCommands = new Collection<string, ChatCommand>();
const buttonCommands = new Collection<string, ButtonCommand>();
const autocompleteCommands = new Collection<string, AutocompleteCommand>();
const contextCommands = new Collection<string, ContextMenuCommand>();

const getCommandImportPath = (dirent: Dirent) => {
  if (dirent.isDirectory()) {
    throw new Error(`Expected a file, but got a directory: ${dirent.name}`);
  }

  const path = dirent.parentPath.replaceAll('\\', '/');
  return `${path.replace('dist', '../../')}/${dirent.name}`;
};

const getModuleCommands = async (module: string) => {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- module names come from discovered local build output directories
    const commandsContents = await readdir(
      `./dist/modules/${module}/commands`,
      {
        recursive: true,
        withFileTypes: true,
      },
    );

    return commandsContents.filter(
      (file) => file.isFile() && file.name.endsWith('.js'),
    );
  } catch (error) {
    logger.debug(
      `Failed reading commands directory for module ${module}\n${String(error)}`,
    );
    return [];
  }
};

type CommandType = 'autocomplete' | 'button' | 'chat' | 'context';

const getCommandType = (parentPath: string): CommandType | null => {
  const normalizedPath = parentPath.replaceAll('\\', '/');

  if (
    normalizedPath.endsWith('/commands/chat') ||
    normalizedPath.includes('/commands/chat/')
  ) {
    return 'chat';
  }
  if (
    normalizedPath.endsWith('/commands/button') ||
    normalizedPath.includes('/commands/button/')
  ) {
    return 'button';
  }
  if (
    normalizedPath.endsWith('/commands/autocomplete') ||
    normalizedPath.includes('/commands/autocomplete/')
  ) {
    return 'autocomplete';
  }
  if (
    normalizedPath.endsWith('/commands/context') ||
    normalizedPath.includes('/commands/context/')
  ) {
    return 'context';
  }

  return null;
};

const getCommandName = (
  commandData:
    | AutocompleteCommand
    | ButtonCommand
    | ChatCommand
    | ContextMenuCommand
    | { data?: { name: string }; name?: string },
): null | string => {
  if ('data' in commandData && commandData.data?.name) {
    return commandData.data.name;
  }
  if ('name' in commandData && commandData.name) {
    return commandData.name;
  }
  return null;
};

const checkAndSetCommand = <T>(params: {
  collection: Collection<string, T>;
  commandData: T;
  commandName: string;
  module: string;
}): boolean => {
  const { collection, commandData, commandName, module } = params;

  if (collection.has(commandName)) {
    logger.warn(
      `Command with name ${commandName} already exists (from ${module})`,
    );
    return false;
  }
  collection.set(commandName, commandData);
  return true;
};

const registerCommand = (params: {
  commandData: unknown;
  commandName: string;
  commandType: CommandType;
  module: string;
}): boolean => {
  const { commandData, commandName, commandType, module } = params;

  if (commandType === 'autocomplete') {
    return checkAndSetCommand({
      collection: autocompleteCommands,
      commandData: commandData as AutocompleteCommand,
      commandName,
      module,
    });
  }

  if (commandType === 'button') {
    return checkAndSetCommand({
      collection: buttonCommands,
      commandData: commandData as ButtonCommand,
      commandName,
      module,
    });
  }

  if (commandType === 'chat') {
    return checkAndSetCommand({
      collection: chatCommands,
      commandData: commandData as ChatCommand,
      commandName,
      module,
    });
  }

  return checkAndSetCommand({
    collection: contextCommands,
    commandData: commandData as ContextMenuCommand,
    commandName,
    module,
  });
};

const loadCommand = async (
  command: Dirent,
  module: string,
): Promise<boolean> => {
  try {
    const importPath = getCommandImportPath(command);
    const commandData = (await import(importPath)) as
      | AutocompleteCommand
      | ButtonCommand
      | ChatCommand
      | ContextMenuCommand
      | { data?: { name: string }; name?: string };

    const commandName = getCommandName(commandData);
    if (!commandName) {
      logger.warn(
        `Command ${command.name} in module ${module} is missing 'name' property`,
      );
      return false;
    }

    const parentPath = command.parentPath.replaceAll('\\', '/');
    const commandType = getCommandType(parentPath);

    if (!commandType) {
      throw new Error(`Unknown command type for ${command.name}`);
    }

    return registerCommand({
      commandData,
      commandName,
      commandType,
      module,
    });
  } catch (error) {
    logger.error(
      `Failed loading command ${command.name} from module ${module}\n${String(error)}`,
    );
    return false;
  }
};

const refreshCommands = async () => {
  chatCommands.clear();
  buttonCommands.clear();
  autocompleteCommands.clear();
  contextCommands.clear();

  const modules = await getModules();
  logger.debug(`Loading commands from ${modules.length} module(s)...`);

  let totalCommands = 0;

  for (const module of modules) {
    const commands = await getModuleCommands(module);

    if (commands.length > 0) {
      logger.debug(`Found ${commands.length} command(s) in module ${module}`);
    }

    for (const command of commands) {
      const success = await loadCommand(command, module);
      if (success) {
        totalCommands++;
      }
    }
  }

  logger.debug(
    `Commands loaded: ${chatCommands.size} chat, ${buttonCommands.size} button, ${autocompleteCommands.size} autocomplete, ${contextCommands.size} context (${totalCommands} total)`,
  );
};

export const getChatCommand = (name: string) => chatCommands.get(name);
export const getButtonCommand = (name: string) => buttonCommands.get(name);
export const getAutocompleteCommand = (name: string) =>
  autocompleteCommands.get(name);
export const getContextMenuCommand = (name: string) =>
  contextCommands.get(name);

export const registerCommands = async () => {
  await refreshCommands();

  const rest = new REST().setToken(getToken());
  const commandsToRegister = [];

  for (const [, command] of chatCommands) {
    commandsToRegister.push(command.data.toJSON());
  }

  for (const [, command] of contextCommands) {
    commandsToRegister.push(command.data.toJSON());
  }

  logger.info(
    `Registering ${commandsToRegister.length} command(s) with Discord...`,
  );

  try {
    await rest.put(Routes.applicationCommands(getApplicationId()), {
      body: commandsToRegister,
    });
    logger.info('Commands registered');
  } catch (error) {
    logger.error(`Failed registering application commands\n${String(error)}`);
  }
};
