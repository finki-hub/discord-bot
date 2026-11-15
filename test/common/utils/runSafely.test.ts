import { beforeEach, expect, test, vi } from 'vitest';

import { runSafely } from '@/common/utils/runSafely.js';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn<() => void>(),
  logger: {
    error: vi.fn<() => void>(),
  },
}));

vi.mock('@/common/logger/index.js', () => ({ logger: mocks.logger }));
vi.mock('@/common/services/analytics.js', () => ({
  captureException: mocks.captureException,
}));

beforeEach(() => {
  mocks.captureException.mockReset();
  mocks.logger.error.mockReset();
});

test('waits for successful operations without logging', async () => {
  const operation = vi.fn<() => Promise<void>>(async () => {});

  await expect(runSafely('Test job', operation)).resolves.toBeUndefined();

  expect(operation).toHaveBeenCalledOnce();
  expect(mocks.logger.error).not.toHaveBeenCalled();
  expect(mocks.captureException).not.toHaveBeenCalled();
});

test('contains failures and reports them without rejecting', async () => {
  await expect(
    runSafely('Test job', async () => {
      throw new TypeError('PRIVATE_DETAIL');
    }),
  ).resolves.toBeUndefined();

  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Test job failed (type_error)',
    {},
  );
  expect(mocks.captureException).toHaveBeenCalledExactlyOnceWith(
    expect.any(TypeError),
    null,
    { phase: 'background_task' },
  );
});

test('passes guild context to the logger', async () => {
  await expect(
    runSafely(
      'Test job',
      async () => {
        throw new TypeError('PRIVATE_DETAIL');
      },
      { guildId: 'guild' },
    ),
  ).resolves.toBeUndefined();

  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Test job failed (type_error)',
    { guildId: 'guild' },
  );
});
