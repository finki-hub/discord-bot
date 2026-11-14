/* eslint-disable security/detect-non-literal-fs-filename -- configuration paths are supplied by the application and tests */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
  type MultiGuildConfig,
  MultiGuildConfigSchema,
} from '@/modules/admin/schemas/BotConfig.js';

const DEFAULT_CONFIG_FILE_PATH = join(process.cwd(), 'config', 'bot.json');

export class ConfigFileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ConfigFileError';
  }
}

const serializeConfig = (config: MultiGuildConfig): string =>
  JSON.stringify(
    config,
    (_, value: unknown) => (value === undefined ? null : value),
    2,
  );

const deserializeConfig = (parsed: unknown): unknown => {
  if (parsed === null || typeof parsed !== 'object') {
    return parsed;
  }

  if (Array.isArray(parsed)) {
    return parsed.map(deserializeConfig);
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (value === null) {
      result[key] = undefined;
    } else if (typeof value === 'object') {
      result[key] = deserializeConfig(value);
    } else {
      result[key] = value;
    }
  }

  return result;
};

const writeConfigFile = async (filePath: string, content: string) => {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });

  // Write beside the target and rename so an interrupted write can never leave
  // a truncated configuration behind.
  const temporaryPath = join(
    directory,
    `.${basename(filePath)}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await rm(temporaryPath, { force: true });
    } catch {
      // Best-effort cleanup; the original error is the useful one.
    }
    throw error;
  }
};

const createEmptyConfig = async (
  filePath: string,
): Promise<MultiGuildConfig> => {
  const emptyConfig: MultiGuildConfig = {};
  await writeConfigFile(filePath, serializeConfig(emptyConfig));
  return emptyConfig;
};

export const getConfig = async (
  filePath = DEFAULT_CONFIG_FILE_PATH,
): Promise<MultiGuildConfig> => {
  let fileContent: string;

  try {
    fileContent = await readFile(filePath, 'utf8');
  } catch (error) {
    if (Error.isError(error) && 'code' in error && error.code === 'ENOENT') {
      try {
        return await createEmptyConfig(filePath);
      } catch (createError) {
        throw new ConfigFileError(
          'Failed creating the bot configuration file',
          { cause: createError },
        );
      }
    }

    throw new ConfigFileError('Failed reading the bot configuration file', {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch (error) {
    throw new ConfigFileError('Invalid bot configuration JSON', {
      cause: error,
    });
  }

  try {
    return MultiGuildConfigSchema.parse(deserializeConfig(parsed));
  } catch (error) {
    throw new ConfigFileError('Invalid bot configuration', { cause: error });
  }
};

export const setConfig = async (
  config: MultiGuildConfig,
  filePath = DEFAULT_CONFIG_FILE_PATH,
): Promise<MultiGuildConfig | null> => {
  try {
    const validated = MultiGuildConfigSchema.parse(config);

    await writeConfigFile(filePath, serializeConfig(validated));

    return validated;
  } catch {
    return null;
  }
};
