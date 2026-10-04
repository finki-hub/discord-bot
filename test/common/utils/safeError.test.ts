import { expect, test } from 'vitest';

import { errorCategory } from '@/common/utils/safeError.js';

test('never reads or renders arbitrary thrown properties', () => {
  const error = new Error('private');
  for (const key of ['name', 'message', 'stack', 'cause', 'toString']) {
    Object.defineProperty(error, key, {
      get: () => {
        throw new Error('private');
      },
    });
  }
  expect(errorCategory(error)).toBe('error');
  expect(
    errorCategory(
      new Proxy(
        {},
        {
          getPrototypeOf: () => {
            throw new Error('private');
          },
        },
      ),
    ),
  ).toBe('unknown');
  expect(errorCategory('private')).toBe('unknown');
  expect(errorCategory(null)).toBe('unknown');
});
