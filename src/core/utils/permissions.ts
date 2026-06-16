import { type GuildMember, PermissionsBitField } from 'discord.js';

import { getRolesProperty } from '@/configuration/bot/index.js';
import { getChatCommand } from '@/core/commands/modules.js';
import { commandDescriptions } from '@/translations/commands.js';

export const commandRequiresPermissions = (command: string): boolean => {
  const parts = command.split(' ');
  const topCommand = parts[0];
  const subcommand = parts[1];
  const commandObj = topCommand ? getChatCommand(topCommand) : undefined;

  if (commandObj?.permissions === undefined) {
    return false;
  }

  const permissions = commandObj.permissions;

  const subcommandPerms = subcommand
    ? permissions.subcommands?.[subcommand]
    : undefined;

  if (subcommandPerms !== undefined) {
    return (
      (subcommandPerms.permissions?.length ?? 0) > 0 ||
      (subcommandPerms.roles?.length ?? 0) > 0
    );
  }

  return (
    (permissions.permissions?.length ?? 0) > 0 ||
    (permissions.roles?.length ?? 0) > 0
  );
};

const getCommandPermission = async (
  command: string,
  guildId: string,
): Promise<[bigint[], Array<string | undefined>]> => {
  const parts = command.split(' ');
  const topCommand = parts[0];
  const subcommand = parts[1];
  const commandObj = topCommand ? getChatCommand(topCommand) : undefined;

  if (commandObj?.permissions === undefined) {
    return [[], []];
  }

  const permissions = commandObj.permissions;

  const subcommandPerms = subcommand
    ? permissions.subcommands?.[subcommand]
    : undefined;

  if (subcommandPerms !== undefined) {
    const subcommandPermissions = subcommandPerms.permissions ?? [];

    const subcommandRoles = await Promise.all(
      (subcommandPerms.roles ?? []).map((role) =>
        getRolesProperty(role, guildId),
      ),
    );

    return [subcommandPermissions, subcommandRoles];
  }

  const commandPermissions = permissions.permissions ?? [];
  const commandRoles = await Promise.all(
    (permissions.roles ?? []).map((role) => getRolesProperty(role, guildId)),
  );

  return [commandPermissions, commandRoles];
};

const isMemberAdministrator = (member: GuildMember) =>
  member.permissions.has(PermissionsBitField.Flags.Administrator);

export const hasCommandPermission = async (
  member: GuildMember,
  command: string,
) => {
  if (isMemberAdministrator(member)) {
    return true;
  }

  const [permissions, roles] = await getCommandPermission(
    command,
    member.guild.id,
  );

  if (permissions.length === 0 && roles.length === 0) {
    return true;
  }

  if (roles.length > 0 && roles.every((role) => role === undefined)) {
    return false;
  }

  return (
    (permissions.length > 0 && member.permissions.has(permissions)) ||
    (roles.length > 0 &&
      member.roles.cache.hasAny(...roles.filter((role) => role !== undefined)))
  );
};

export const getCommandsWithPermission = async (member: GuildMember) => {
  const permittedCommands = await Promise.all(
    Object.keys(commandDescriptions).map((command) =>
      hasCommandPermission(member, command),
    ),
  );

  return Object.keys(commandDescriptions).filter(
    (_, index) => permittedCommands[index],
  );
};
