import { beforeEach, expect, test, vi } from 'vitest';

import { WebhookTransport } from '@/common/logger/webhookTransport.js';

const mocks = vi.hoisted(() => ({
  construct: vi.fn<() => void>(),
  send: vi.fn<() => Promise<void>>(),
}));
const consoleError = vi.fn<() => void>();
vi.mock('discord.js', () => ({
  WebhookClient: class {
    send = mocks.send;
    constructor() {
      mocks.construct();
    }
  },
}));
vi.mock('@/configuration/bot/file.js', () => ({
  getConfig: async () => ({
    guild: { errorWebhook: 'https://example.invalid/PRIVATE_WEBHOOK' },
  }),
}));

beforeEach(() => {
  mocks.send.mockResolvedValue();
  vi.spyOn(console, 'error').mockImplementation(consoleError);
});

const log = async (transport: WebhookTransport) =>
  new Promise<void>((resolve) => {
    transport.log(
      {
        level: 'error',
        message: 'Fixed diagnostic',
        guildId: 'guild',
        timestamp: '2026-10-04',
      },
      resolve,
    );
  });

test('webhook construction failure does not render credential-bearing errors', async () => {
  mocks.construct.mockImplementationOnce(() => {
    throw new Error('PRIVATE_WEBHOOK');
  });
  const transport = new WebhookTransport();
  await log(transport);
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    'Failed initializing error webhook (error)',
  );
  expect(mocks.send).not.toHaveBeenCalled();
  transport.destroy();
});

test('webhook send failure retains alerting and evicts the failed client safely', async () => {
  mocks.send.mockRejectedValueOnce(new TypeError('PRIVATE_WEBHOOK'));
  const transport = new WebhookTransport();
  await log(transport);
  await log(transport);
  expect(mocks.construct).toHaveBeenCalledTimes(2);
  expect(mocks.send).toHaveBeenCalledWith({
    content: '2026-10-04 - error: Fixed diagnostic',
  });
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    'Failed sending to error webhook (type_error)',
  );
  transport.destroy();
});
