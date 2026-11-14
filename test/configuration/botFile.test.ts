/* eslint-disable security/detect-non-literal-fs-filename -- test paths are created in a temporary directory */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';

import {
  ConfigFileError,
  getConfig,
  setConfig,
} from '@/configuration/bot/file.js';

const directories: string[] = [];

const makeConfigPath = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finki-config-'));
  directories.push(directory);

  return join(directory, 'bot.json');
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('creates a missing configuration file with an empty config', async () => {
  const filePath = await makeConfigPath();

  await expect(getConfig(filePath)).resolves.toEqual({});
  await expect(readFile(filePath, 'utf8')).resolves.toBe('{}');
});

test('rejects invalid JSON without overwriting the file', async () => {
  const filePath = await makeConfigPath();
  const invalidContent = '{"guild":';
  await writeFile(filePath, invalidContent, 'utf8');

  await expect(getConfig(filePath)).rejects.toBeInstanceOf(ConfigFileError);
  await expect(readFile(filePath, 'utf8')).resolves.toBe(invalidContent);
});

test('rejects configuration that fails schema validation', async () => {
  const filePath = await makeConfigPath();
  await writeFile(
    filePath,
    JSON.stringify({ guild: { feedback: 'not-an-object' } }),
    'utf8',
  );

  await expect(getConfig(filePath)).rejects.toBeInstanceOf(ConfigFileError);
});

test('round-trips configuration through an atomic replacement', async () => {
  const filePath = await makeConfigPath();
  const config = {
    guild: { errorWebhook: 'https://example.invalid/error' },
  };

  await expect(setConfig(config, filePath)).resolves.toEqual(config);
  await expect(getConfig(filePath)).resolves.toEqual(config);
});
