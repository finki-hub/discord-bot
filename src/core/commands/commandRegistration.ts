/* eslint-disable security/detect-non-literal-fs-filename -- the registration marker lives in the application's configuration directory */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type CommandRegistrationMarker = {
  applicationId: string;
  hash: string;
};

const MARKER_FILE_PATH = join(
  process.cwd(),
  'config',
  'command-registration.json',
);

const commandSortKey = (command: unknown): string => {
  if (typeof command !== 'object' || command === null) {
    return '';
  }

  const { name, type } = command as { name?: unknown; type?: unknown };
  return `${String(type)}:${String(name)}`;
};

const commandCollator = new Intl.Collator();

export const commandRegistrationHash = (
  applicationId: string,
  commands: readonly unknown[],
): string => {
  const sortedCommands = commands.toSorted((first, second) =>
    commandCollator.compare(commandSortKey(first), commandSortKey(second)),
  );

  return createHash('sha256')
    .update(JSON.stringify({ applicationId, commands: sortedCommands }))
    .digest('hex');
};

export const readCommandRegistrationMarker = async (
  filePath = MARKER_FILE_PATH,
): Promise<CommandRegistrationMarker | null> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const marker = parsed as Record<string, unknown>;
    if (
      typeof marker['applicationId'] === 'string' &&
      typeof marker['hash'] === 'string'
    ) {
      return { applicationId: marker['applicationId'], hash: marker['hash'] };
    }
  } catch {
    // A missing or unreadable marker means commands should be registered.
  }

  return null;
};

export const writeCommandRegistrationMarker = async (
  marker: CommandRegistrationMarker,
  filePath = MARKER_FILE_PATH,
): Promise<boolean> => {
  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(marker), 'utf8');
    return true;
  } catch {
    return false;
  }
};
