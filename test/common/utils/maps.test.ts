import { describe, expect, test } from 'vitest';

import { capMap } from '@/common/utils/maps.js';

describe('capMap', () => {
  test('drops the oldest entries above the limit', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);

    capMap(map, 2);

    expect([...map]).toEqual([
      ['b', 2],
      ['c', 3],
    ]);
  });

  test('leaves a map within the limit untouched', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    capMap(map, 2);

    expect(map.keys().toArray()).toEqual(['a', 'b']);
  });
});
