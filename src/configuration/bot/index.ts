import { logger } from '@/common/logger/index.js';
import {
  type BotConfig,
  type BotConfigKeys,
  BotConfigSchema,
  type FullyRequiredBotConfig,
  type MultiGuildConfig,
} from '@/modules/admin/schemas/BotConfig.js';
import { configErrorFunctions } from '@/translations/errors.js';

import { DEFAULT_CONFIGURATION } from './defaults.js';
import {
  getConfig as getConfigFile,
  setConfig as setConfigFile,
} from './file.js';

type ConfigShape = NonNullable<BotConfig>;

const configState: { multiGuildConfig: MultiGuildConfig | undefined } = {
  multiGuildConfig: undefined,
};

const setMultiGuildConfig = (value: MultiGuildConfig) => {
  configState.multiGuildConfig = value;
};

const getLoadedConfigState = async (): Promise<MultiGuildConfig> => {
  if (configState.multiGuildConfig === undefined) {
    setMultiGuildConfig((await getConfigFile()) ?? {});
  }

  return configState.multiGuildConfig ?? {};
};

const getGuildConfig = async (guildId: string): Promise<ConfigShape> => {
  const currentConfig = await getLoadedConfigState();

  if (currentConfig[guildId] === undefined) {
    logger.info(`Initializing default configuration for guild ${guildId}`);
    currentConfig[guildId] = BotConfigSchema.parse(DEFAULT_CONFIGURATION);
    setMultiGuildConfig(currentConfig);
    await setConfigFile(currentConfig);
  }

  return currentConfig[guildId] ?? DEFAULT_CONFIGURATION;
};

export const reloadConfig = async () => {
  const currentConfig = await getConfigFile();

  try {
    setMultiGuildConfig(currentConfig ?? {});
    logger.info('Configuration reloaded');
  } catch (error) {
    setMultiGuildConfig({});

    logger.warn(configErrorFunctions.invalidConfiguration(error));
    logger.error(`Failed reloading configuration\n${String(error)}`);
  }
};

export const getConfigProperty = async <T extends BotConfigKeys>(
  key: T,
  guildId: string,
) => {
  const config = await getGuildConfig(guildId);
  return config[key] ?? DEFAULT_CONFIGURATION[key];
};

export const setConfigProperty = async <T extends BotConfigKeys>(
  key: T,
  value: ConfigShape[T],
  guildId: string,
) => {
  const guildConfig = await getGuildConfig(guildId);
  guildConfig[key] = value;
  const currentConfig = await getLoadedConfigState();
  currentConfig[guildId] = guildConfig;
  setMultiGuildConfig(currentConfig);

  const newValue = await setConfigFile(currentConfig);

  return newValue?.[guildId] ?? null;
};

export const getGuildConfigFull = async (
  guildId: string,
): Promise<BotConfig | null> => {
  const currentConfig = await getLoadedConfigState();

  return currentConfig[guildId] ?? null;
};

export const setGuildConfigFull = async (
  guildId: string,
  config: BotConfig,
): Promise<BotConfig | null> => {
  const validated = BotConfigSchema.parse(config);
  const currentConfig = await getLoadedConfigState();
  currentConfig[guildId] = validated;
  setMultiGuildConfig(currentConfig);

  const newValue = await setConfigFile(currentConfig);

  return newValue?.[guildId] ?? null;
};

export const getConfigKeys = (): readonly string[] =>
  Object.keys(DEFAULT_CONFIGURATION);

export const getChannelsProperty = async <
  T extends keyof FullyRequiredBotConfig['channels'],
>(
  key: T,
  guildId: string,
) => {
  const config = await getGuildConfig(guildId);
  return config.channels?.[key];
};

export const getCrosspostingProperty = async <
  T extends keyof FullyRequiredBotConfig['crossposting'],
>(
  key: T,
  guildId: string,
) => {
  const config = await getGuildConfig(guildId);
  return config.crossposting?.[key];
};

export const getRolesProperty = async (
  key: keyof FullyRequiredBotConfig['roles'],
  guildId: string,
): Promise<string | undefined> => {
  const config = await getGuildConfig(guildId);
  return config.roles?.[key];
};

export const getTicketingProperty = async <
  T extends keyof FullyRequiredBotConfig['ticketing'],
>(
  key: T,
  guildId: string,
) => {
  const config = await getGuildConfig(guildId);
  return config.ticketing?.[key] ?? DEFAULT_CONFIGURATION.ticketing[key];
};

export const getTicketProperty = async (key: string, guildId: string) => {
  const tickets = await getTicketingProperty('tickets', guildId);

  return tickets?.find((ticket) => ticket.id === key);
};
