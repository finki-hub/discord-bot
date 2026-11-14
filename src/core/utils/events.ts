import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { logger } from '@/common/logger/index.js';
import { ClientEventSchema } from '@/common/schemas/ClientEvent.js';
import { errorCategory } from '@/common/utils/safeError.js';

import { client } from '../client.js';

// Discovery follows the running code, so `tsx src/index.ts` scans `src/core/events`
// while the built bot scans `dist/core/events`.
const EVENTS_DIRECTORY = fileURLToPath(new URL('../events/', import.meta.url));
const EVENT_FILE_PATTERN = /\.(?:js|ts)$/u;

// Discord.js does not await event listeners, so a rejected promise here would
// surface as an unhandled rejection and exit the process. Contain handler
// failures at the event boundary instead.
export const createSafeEventExecutor =
  (eventName: string, execute: (...args: unknown[]) => unknown) =>
  async (...args: unknown[]) => {
    try {
      await execute(...args);
    } catch (error) {
      logger.error(
        `Event handler ${eventName} failed (${errorCategory(error)})`,
      );
    }
  };

export const attachEventListeners = async () => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the events directory is derived from the running module location
  const eventEntries = await readdir(EVENTS_DIRECTORY);
  const eventFiles = eventEntries.filter(
    (file) => EVENT_FILE_PATTERN.test(file) && !file.endsWith('.d.ts'),
  );

  logger.debug(`Found ${eventFiles.length} event file(s)`);

  for (const file of eventFiles) {
    try {
      const rawEvent: unknown = await import(
        pathToFileURL(join(EVENTS_DIRECTORY, file)).href
      );
      const event = ClientEventSchema.parse(rawEvent);
      const execute = createSafeEventExecutor(event.name, event.execute);

      if (event.once) {
        client.once(event.name, execute);
      } else {
        client.on(event.name, execute);
      }

      logger.debug(
        `Attached event listener: ${event.name} (${event.once ? 'once' : 'on'})`,
      );
    } catch (error) {
      logger.error(
        `Failed to attach event listener from ${file}: ${String(error)}`,
      );
    }
  }
};
