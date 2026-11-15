import { expect, test } from 'vitest';

import { withTimeout } from '@/common/utils/timeout.js';

test('resolves before the timeout elapses', async () => {
  await expect(
    withTimeout(Promise.resolve('done'), 1_000, 'TOO_SLOW'),
  ).resolves.toBe('done');
});

test('rejects when the timeout elapses first', async () => {
  await expect(
    withTimeout(new Promise(() => {}), 1, 'TOO_SLOW'),
  ).rejects.toThrow('TOO_SLOW');
});
