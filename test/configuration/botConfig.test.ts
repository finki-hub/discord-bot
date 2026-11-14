import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn<() => Promise<Record<string, unknown>>>(),
  logger: {
    error: vi.fn<() => void>(),
    info: vi.fn<() => void>(),
    warn: vi.fn<() => void>(),
  },
  setConfig: vi.fn<() => Promise<null | Record<string, unknown>>>(),
}));

vi.mock('@/common/logger/index.js', () => ({ logger: mocks.logger }));
vi.mock('@/configuration/bot/file.js', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/configuration/bot/file.js',
  );

  return {
    ...actual,
    getConfig: mocks.getConfig,
    setConfig: mocks.setConfig,
  };
});

const loadConfig = async () => {
  vi.resetModules();

  const fileModule = await import('@/configuration/bot/file.js');
  const configModule = await import('@/configuration/bot/index.js');

  return { ...configModule, ConfigFileError: fileModule.ConfigFileError };
};

beforeEach(() => {
  mocks.getConfig.mockReset();
  mocks.setConfig.mockReset();
  mocks.logger.error.mockReset();
  mocks.logger.info.mockReset();
  mocks.logger.warn.mockReset();
});

test('a failed load keeps defaults in memory and blocks persistence', async () => {
  mocks.getConfig.mockRejectedValueOnce(new Error('PRIVATE_DETAIL'));
  const { getConfigProperty, reloadConfig, setConfigProperty } =
    await loadConfig();

  await expect(reloadConfig()).resolves.toBe(false);

  await expect(getConfigProperty('feedback', 'guild')).resolves.toEqual({
    enabled: true,
  });
  await expect(
    setConfigProperty('feedback', { enabled: false }, 'guild'),
  ).resolves.toBeNull();
  expect(mocks.setConfig).not.toHaveBeenCalled();
  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Failed reloading configuration (error)',
  );
});

test('a known configuration failure logs its safe reason', async () => {
  const { ConfigFileError, reloadConfig } = await loadConfig();
  mocks.getConfig.mockRejectedValueOnce(
    new ConfigFileError('Invalid bot configuration JSON'),
  );

  await expect(reloadConfig()).resolves.toBe(false);

  expect(mocks.logger.error).toHaveBeenCalledExactlyOnceWith(
    'Failed reloading configuration (Invalid bot configuration JSON)',
  );
});

test('a successful load restores normal persistence', async () => {
  const storedConfig = { guild: { feedback: { enabled: false } } };
  mocks.getConfig.mockResolvedValueOnce(storedConfig);
  mocks.setConfig.mockResolvedValueOnce(storedConfig);
  const { getConfigProperty, reloadConfig, setConfigProperty } =
    await loadConfig();

  await expect(reloadConfig()).resolves.toBe(true);

  await expect(getConfigProperty('feedback', 'guild')).resolves.toEqual({
    enabled: false,
  });
  await expect(
    setConfigProperty('feedback', { enabled: true }, 'guild'),
  ).resolves.toEqual({ feedback: { enabled: true } });
  expect(mocks.setConfig).toHaveBeenCalledOnce();
});
