import { Routes } from 'discord.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import { registerCommands } from '@/core/commands/modules.js';

type Marker = { applicationId: string; hash: string };

const mocks = vi.hoisted(() => ({
  getApplicationId: vi.fn<() => string>(),
  put: vi.fn<(route: string, options: { body: unknown }) => Promise<unknown>>(),
  readMarker: vi.fn<() => Promise<Marker | null>>(),
  writeMarker: vi.fn<(marker: Marker) => Promise<boolean>>(),
}));

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  class RestMock {
    public put = mocks.put;

    public setToken() {
      return this;
    }
  }

  return { ...actual, REST: RestMock };
});

vi.mock('@/configuration/environment.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return {
    ...actual,
    getApplicationId: mocks.getApplicationId,
    getToken: () => 'token',
  };
});

vi.mock('@/core/commands/commandRegistration.js', () => ({
  commandRegistrationHash: () => 'hash',
  readCommandRegistrationMarker: mocks.readMarker,
  writeCommandRegistrationMarker: mocks.writeMarker,
}));

const originalLoggerSilent = logger.silent;

beforeEach(() => {
  logger.silent = true;
  mocks.getApplicationId.mockReset();
  mocks.getApplicationId.mockReturnValue('application');
  mocks.put.mockReset();
  mocks.readMarker.mockReset();
  mocks.writeMarker.mockReset();
  mocks.writeMarker.mockResolvedValue(true);
});

afterEach(() => {
  logger.silent = originalLoggerSilent;
});

test('skips the PUT when the registration marker matches', async () => {
  mocks.readMarker.mockResolvedValue({
    applicationId: 'application',
    hash: 'hash',
  });

  await registerCommands();

  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.writeMarker).not.toHaveBeenCalled();
});

test('registers and advances the marker when it differs', async () => {
  mocks.readMarker.mockResolvedValue({
    applicationId: 'application',
    hash: 'old',
  });

  await registerCommands();

  expect(mocks.put).toHaveBeenCalledOnce();
  const putCall = mocks.put.mock.calls[0];
  expect(putCall?.[0]).toBe(Routes.applicationCommands('application'));
  expect(putCall?.[1].body).toBeInstanceOf(Array);
  expect(mocks.writeMarker).toHaveBeenCalledExactlyOnceWith({
    applicationId: 'application',
    hash: 'hash',
  });
});

test('registers when the marker is missing', async () => {
  mocks.readMarker.mockResolvedValue(null);

  await registerCommands();

  expect(mocks.put).toHaveBeenCalledOnce();
  expect(mocks.writeMarker).toHaveBeenCalledOnce();
});

test('does not advance the marker when registration fails', async () => {
  mocks.readMarker.mockResolvedValue(null);
  mocks.put.mockRejectedValueOnce(new Error('registration failed'));

  await expect(registerCommands()).resolves.toBeUndefined();

  expect(mocks.writeMarker).not.toHaveBeenCalled();
});

test('logs and continues when the application ID cannot be read', async () => {
  mocks.getApplicationId.mockImplementationOnce(() => {
    throw new Error('missing application id');
  });

  await expect(registerCommands()).resolves.toBeUndefined();

  expect(mocks.readMarker).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});
