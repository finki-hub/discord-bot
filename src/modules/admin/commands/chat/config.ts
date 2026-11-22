import { InteractionContextType } from 'discord-api-types/v10';
import {
  type ChatInputCommandInteraction,
  codeBlock,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { createChatCommandChoices } from '@/common/commands/chat.js';
import { executeSubcommand } from '@/common/commands/subcommands.js';
import { logger } from '@/common/logger/index.js';
import { Role } from '@/common/schemas/Role.js';
import { fitsJsonCodeBlock } from '@/common/utils/limits.js';
import { runSafely } from '@/common/utils/runSafely.js';
import {
  getConfigKeys,
  getConfigProperty,
  getGuildConfigFull,
  reloadConfig,
  setConfigProperty,
} from '@/configuration/bot/index.js';
import { refreshOnConfigChange } from '@/configuration/bot/refresh.js';
import {
  BotConfigKeysSchema,
  RequiredBotConfigSchema,
} from '@/modules/admin/schemas/BotConfig.js';
import { reloadCourses } from '@/modules/course/utils/data.js';
import { reloadQuotes } from '@/modules/misc/utils/data.js';
import { reloadRooms } from '@/modules/room/utils/data.js';
import { reloadSessions } from '@/modules/session/utils/data.js';
import { reloadStaff } from '@/modules/staff/utils/data.js';
import { getTicketNamesSchema } from '@/modules/ticket/schemas/Ticket.js';
import {
  commandDescriptions,
  commandErrorFunctions,
  commandErrors,
  commandResponses,
} from '@/translations/commands.js';

export const name = 'config';

export const permissions = {
  permissions: [PermissionFlagsBits.ManageGuild],
  roles: [Role.Administrators],
};

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription('Конгифурација')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('get')
      .setDescription(commandDescriptions['config get'])
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('Клуч на конфигурација')
          .setRequired(false)
          .addChoices(...createChatCommandChoices(getConfigKeys())),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription(commandDescriptions['config set'])
      .addStringOption((option) =>
        option
          .setName('key')
          .setDescription('Клуч на конфигурација')
          .setRequired(true)
          .addChoices(...createChatCommandChoices(getConfigKeys())),
      )
      .addStringOption((option) =>
        option
          .setName('value')
          .setDescription('Вредност на конфигурација')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('reload')
      .setDescription(commandDescriptions['config reload']),
  )
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const handleConfigGet = async (interaction: ChatInputCommandInteraction) => {
  if (interaction.guild === null) {
    return;
  }

  const rawKey = interaction.options.getString('key');

  if (rawKey === null) {
    const guildConfig = await getGuildConfigFull(interaction.guild.id);

    await interaction.editReply({
      files: [
        {
          attachment: Buffer.from(JSON.stringify(guildConfig ?? {}, null, 2)),
          name: 'config.json',
        },
      ],
    });

    return;
  }

  const key = BotConfigKeysSchema.parse(rawKey);
  const value = await getConfigProperty(key, interaction.guild.id);

  const config = JSON.stringify(
    {
      [key]: value,
    },
    null,
    2,
  );

  if (!fitsJsonCodeBlock(config)) {
    await interaction.editReply({
      files: [
        {
          attachment: Buffer.from(config),
          name: 'config.json',
        },
      ],
    });

    return;
  }

  await interaction.editReply(codeBlock('json', config));
};

const handleConfigSet = async (interaction: ChatInputCommandInteraction) => {
  const key = BotConfigKeysSchema.parse(
    interaction.options.getString('key', true),
  );
  const rawValue = interaction.options.getString('value', true);
  let jsonValue: unknown;

  try {
    jsonValue = JSON.parse(rawValue);
  } catch (error) {
    logger.error(`Failed setting config\n${String(error)}`, {
      guildId: interaction.guild?.id,
    });
    await interaction.editReply(
      commandErrorFunctions.invalidConfiguration(error),
    );

    return;
  }

  const parsedValue = RequiredBotConfigSchema.shape[key].safeParse(jsonValue);

  if (!parsedValue.success) {
    await interaction.editReply(
      commandErrorFunctions.invalidConfiguration(parsedValue.error),
    );

    return;
  }

  if (interaction.guild === null) {
    return;
  }

  const guildId = interaction.guild.id;

  if (key === 'ticketing') {
    const saved = await getConfigProperty('ticketing', guildId);
    const ticketNames = getTicketNamesSchema(
      new Set(saved.tickets?.map((ticket) => ticket.name)),
    ).safeParse(parsedValue.data);

    if (!ticketNames.success) {
      await interaction.editReply(
        commandErrorFunctions.invalidConfiguration(ticketNames.error),
      );

      return;
    }
  }

  const rawNewConfig = await setConfigProperty(key, parsedValue.data, guildId);

  if (rawNewConfig === null) {
    await interaction.editReply(commandErrors.configurationSavingFailed);

    return;
  }

  const newProperty = JSON.stringify(
    {
      [key]: rawNewConfig[key],
    },
    null,
    2,
  );

  void runSafely('Config refresh', () => refreshOnConfigChange(key, guildId), {
    guildId,
  });

  if (!fitsJsonCodeBlock(newProperty)) {
    await interaction.editReply({
      files: [
        {
          attachment: Buffer.from(newProperty),
          name: 'config.json',
        },
      ],
    });

    return;
  }

  await interaction.editReply(codeBlock('json', newProperty));
};

const reloadData = async (guildId: string | undefined): Promise<boolean> => {
  try {
    await Promise.all([
      reloadCourses(),
      reloadQuotes(),
      reloadRooms(),
      reloadSessions(),
      reloadStaff(),
    ]);

    return true;
  } catch (error) {
    logger.error(`Failed reloading data\n${String(error)}`, { guildId });

    return false;
  }
};

const handleConfigReload = async (interaction: ChatInputCommandInteraction) => {
  await interaction.editReply(commandResponses.configurationReloading);

  // Independent, so a failure in one still refreshes the other.
  const [configReloaded, dataReloaded] = await Promise.all([
    reloadConfig(),
    reloadData(interaction.guild?.id),
  ]);
  const failures = [
    ...(configReloaded ? [] : [commandErrors.configurationReloadFailed]),
    ...(dataReloaded ? [] : [commandErrors.dataReloadFailed]),
  ];

  await interaction.editReply(
    failures.length === 0
      ? commandResponses.configurationReloaded
      : failures.join('\n'),
  );
};

const configHandlers = {
  get: handleConfigGet,
  reload: handleConfigReload,
  set: handleConfigSet,
};

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await executeSubcommand(interaction, configHandlers);
};
