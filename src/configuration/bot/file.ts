import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  type MultiGuildConfig,
  MultiGuildConfigSchema,
} from '@/modules/admin/schemas/BotConfig.js';

const CONFIG_FILE_PATH = join(process.cwd(), 'config', 'bot.json');

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

export const getConfig = async (): Promise<MultiGuildConfig | null> => {
  try {
    const fileContent = await readFile(CONFIG_FILE_PATH, 'utf8');
    const parsed: unknown = JSON.parse(fileContent);
    const deserialized = deserializeConfig(parsed);

    return MultiGuildConfigSchema.parse(deserialized);
  } catch (error) {
    if (Error.isError(error) && error.name === 'SyntaxError') {
      return null;
    }

    if (Error.isError(error) && 'code' in error && error.code === 'ENOENT') {
      try {
        await mkdir(dirname(CONFIG_FILE_PATH), { recursive: true });

        const emptyConfig: MultiGuildConfig = {};
        const jsonContent = serializeConfig(emptyConfig);
        await writeFile(CONFIG_FILE_PATH, jsonContent, 'utf8');

        return emptyConfig;
      } catch {
        return null;
      }
    }

    return null;
  }
};

export const setConfig = async (
  config: MultiGuildConfig,
): Promise<MultiGuildConfig | null> => {
  try {
    const validated = MultiGuildConfigSchema.parse(config);
    const jsonContent = serializeConfig(validated);

    await mkdir(dirname(CONFIG_FILE_PATH), {
      recursive: true,
    });

    await writeFile(CONFIG_FILE_PATH, jsonContent, 'utf8');

    return validated;
  } catch {
    return null;
  }
};
