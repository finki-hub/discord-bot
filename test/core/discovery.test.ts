import type { EventEmitter } from 'node:events';

import { Events } from 'discord.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import { client } from '@/core/client.js';
import { getChatCommand, loadCommands } from '@/core/commands/modules.js';
import {
  attachEventListeners,
  createSafeEventExecutor,
} from '@/core/utils/events.js';
import { getModules } from '@/core/utils/modules.js';

vi.mock('@/core/client.js', async () => {
  const { EventEmitter } = await import('node:events');

  return {
    // eslint-disable-next-line unicorn/prefer-event-target -- the real client is an EventEmitter
    client: new EventEmitter(),
  };
});

const originalLoggerSilent = logger.silent;

beforeEach(() => {
  logger.silent = true;
});

afterEach(() => {
  logger.silent = originalLoggerSilent;
  vi.restoreAllMocks();
});

test('discovers modules from the running source tree', async () => {
  await expect(getModules()).resolves.toEqual(
    expect.arrayContaining(['chat', 'ticket']),
  );
});

test('loads commands from the running source tree', async () => {
  await loadCommands();

  expect(getChatCommand('help')).toBeDefined();
});

test('attaches listeners for every discovered event', async () => {
  const emitter = client as unknown as EventEmitter;

  await attachEventListeners();

  expect(emitter.listenerCount(Events.ClientReady)).toBe(1);
  expect(emitter.listenerCount(Events.InteractionCreate)).toBe(1);
  expect(emitter.listenerCount(Events.MessageCreate)).toBe(1);

  emitter.removeAllListeners();
});

test('contains rejected event handlers instead of rejecting', async () => {
  const error = vi.spyOn(logger, 'error');
  const execute = createSafeEventExecutor('interactionCreate', async () => {
    throw new TypeError('PRIVATE_DETAIL');
  });

  await expect(execute()).resolves.toBeUndefined();
  expect(error).toHaveBeenCalledExactlyOnceWith(
    'Event handler interactionCreate failed (type_error)',
  );
});
