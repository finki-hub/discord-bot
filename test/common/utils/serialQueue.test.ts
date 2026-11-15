import { expect, test } from 'vitest';

import { SerialQueue } from '@/common/utils/serialQueue.js';

test('runs operations in submission order', async () => {
  const queue = new SerialQueue();
  const order: string[] = [];
  const gate = Promise.withResolvers<undefined>();

  const first = queue.run(async () => {
    await gate.promise;
    order.push('first');
  });
  const second = queue.run(async () => {
    order.push('second');
  });

  expect(order).toEqual([]);
  gate.resolve(undefined);
  await Promise.all([first, second]);

  expect(order).toEqual(['first', 'second']);
});

test('continues after a failed operation', async () => {
  const queue = new SerialQueue();

  await expect(
    queue.run(async () => {
      throw new Error('operation failed');
    }),
  ).rejects.toThrow('operation failed');
  await expect(queue.run(async () => 'next')).resolves.toBe('next');
});
