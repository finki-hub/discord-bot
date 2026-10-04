import { beforeEach, expect, test, vi } from 'vitest';

import { attachProcessListeners } from '@/core/utils/process.js';

const mocks = vi.hoisted(() => ({
  captureException: vi.fn<() => void>(),
  shutdownAnalytics: vi.fn<() => Promise<void>>(),
  logger: {
    info: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
    error: vi.fn<() => void>(),
  },
}));
vi.mock('@/common/logger/index.js', () => ({ logger: mocks.logger }));
vi.mock('@/common/services/analytics.js', () => mocks);
type Handler = (error?: unknown) => Promise<void> | void;
const handlers = new Map<string | symbol, Handler>();
const exit = vi.fn<() => never>(() => undefined as never);

beforeEach(() => {
  handlers.clear();
  vi.spyOn(process, 'on').mockImplementation((event, handler) => {
    handlers.set(event, handler as Handler);
    return process;
  });
  vi.spyOn(process, 'exit').mockImplementation(exit);
  mocks.shutdownAnalytics.mockResolvedValue();
  attachProcessListeners();
});

test.each(['SIGINT', 'SIGTERM'])(
  '%s flushes and exits successfully',
  async (event) => {
    await handlers.get(event)?.();
    expect(mocks.shutdownAnalytics).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  },
);

test.each(['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'])(
  '%s still exits 1 when flush fails without logging the exception',
  async (event) => {
    mocks.shutdownAnalytics.mockRejectedValueOnce(
      new Error('PRIVATE_SDK_ERROR'),
    );
    await handlers.get(event)?.(new Error('PRIVATE_ORIGINAL_ERROR'));
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain(
      'PRIVATE_',
    );
    expect(mocks.logger.error).toHaveBeenCalled();
  },
);

test('process warning retains fixed diagnostics without raw details', async () => {
  await handlers.get('warning')?.(new Error('PRIVATE_WARNING'));
  expect(mocks.logger.warn).toHaveBeenCalledExactlyOnceWith(
    'Process warning (error)',
  );
});
