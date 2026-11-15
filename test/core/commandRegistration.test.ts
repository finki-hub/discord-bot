/* eslint-disable security/detect-non-literal-fs-filename -- test paths are temporary */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';

import {
  commandRegistrationHash,
  readCommandRegistrationMarker,
  writeCommandRegistrationMarker,
} from '@/core/commands/commandRegistration.js';

const directories: string[] = [];

const makeMarkerPath = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finki-commands-'));
  directories.push(directory);

  return join(directory, 'command-registration.json');
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('hashes are stable regardless of command order', () => {
  const helpCommand = { description: 'help', name: 'help', type: 1 };
  const ticketCommand = { description: 'ticket', name: 'ticket', type: 1 };

  expect(
    commandRegistrationHash('application', [helpCommand, ticketCommand]),
  ).toBe(commandRegistrationHash('application', [ticketCommand, helpCommand]));
});

test('hashes change with the application or command content', () => {
  const command = { description: 'help', name: 'help', type: 1 };
  const baseHash = commandRegistrationHash('application', [command]);

  expect(commandRegistrationHash('other-application', [command])).not.toBe(
    baseHash,
  );
  expect(
    commandRegistrationHash('application', [
      { ...command, description: 'changed' },
    ]),
  ).not.toBe(baseHash);
});

test('registration markers round-trip and reject invalid content', async () => {
  const filePath = await makeMarkerPath();
  const marker = { applicationId: 'application', hash: 'abc123' };

  await expect(readCommandRegistrationMarker(filePath)).resolves.toBeNull();
  await expect(writeCommandRegistrationMarker(marker, filePath)).resolves.toBe(
    true,
  );
  await expect(readCommandRegistrationMarker(filePath)).resolves.toEqual(
    marker,
  );

  await writeFile(filePath, '{"applicationId":1}', 'utf8');
  await expect(readCommandRegistrationMarker(filePath)).resolves.toBeNull();
});
