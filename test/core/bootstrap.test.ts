import { beforeEach, expect, test, vi } from 'vitest';

import { bootstrap } from '@/core/bootstrap.js';

const mocks = vi.hoisted(() => ({
  attach: vi.fn<() => void>(),
  login: vi.fn<() => Promise<void>>(),
  logger: {
    info: vi.fn<() => void>(),
    debug: vi.fn<() => void>(),
    error: vi.fn<() => void>(),
  },
}));
vi.mock('@/common/logger/index.js', () => ({ logger: mocks.logger }));
vi.mock('@/common/services/analytics.js', () => ({
  initAnalytics: vi.fn<() => void>(),
}));
vi.mock('@/configuration/bot/index.js', () => ({
  reloadConfig: async () => {},
}));
vi.mock('@/configuration/environment.js', () => ({
  getToken: () => 'fake-token',
}));
vi.mock('@/core/client.js', () => ({ client: { login: mocks.login } }));
vi.mock('@/core/commands/modules.js', () => ({
  registerCommands: async () => {},
}));
vi.mock('@/core/utils/events.js', () => ({
  attachEventListeners: async () => {},
}));
vi.mock('@/core/utils/modules.js', () => ({
  initializeModules: async () => {},
}));
vi.mock('@/core/utils/process.js', () => ({
  attachProcessListeners: mocks.attach,
}));

beforeEach(() => {
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
  mocks.login.mockResolvedValue();
});

test('installs owned fatal listeners once before environment loading can fail', async () => {
  const error = new Error('PRIVATE_ENV_ERROR');
  vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {
    expect(mocks.attach).toHaveBeenCalledOnce();
    throw error;
  });
  await expect(bootstrap()).rejects.toBe(error);
  expect(mocks.login).not.toHaveBeenCalled();
});

test('login failure preserves cause and rejection but logs only categorical diagnostics', async () => {
  const error = new TypeError('PRIVATE_TOKEN');
  mocks.login.mockRejectedValueOnce(error);
  await expect(bootstrap()).rejects.toMatchObject({
    message: 'Failed logging in (type_error)',
    cause: error,
  });
  expect(mocks.attach).toHaveBeenCalledOnce();
  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Failed logging in (type_error)',
  );
});
