import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import { type Role } from '@/common/schemas/Role.js';

export type AutocompleteCommand = {
  data?: undefined;
  execute: (interaction: AutocompleteInteraction) => Promise<void>;
  name: string;
};

export type ButtonCommand = {
  data?: undefined;
  execute: (interaction: ButtonInteraction, args: string[]) => Promise<void>;
  name: string;
};

export type ChatCommand = {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  name: string;
  permissions?: CommandPermissions;
};

export type Command =
  | AutocompleteCommand
  | ButtonCommand
  | ChatCommand
  | ContextMenuCommand
  | ModalCommand;

export type CommandPermissions = {
  permissions?: bigint[];
  roles?: Role[];
  subcommands?: Record<string, CommandPermissions>;
};

export type ContextMenuCommand = {
  data: ContextMenuCommandBuilder;
  execute: (interaction: ContextMenuCommandInteraction) => Promise<void>;
  name: string;
};

export type ModalCommand = {
  data?: undefined;
  execute: (
    interaction: ModalSubmitInteraction,
    args: string[],
  ) => Promise<void>;
  name: string;
};
