import { describe, expect, test } from 'vitest';

import { capMap, setNewest } from '@/common/utils/maps.js';

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

describe('setNewest', () => {
  test('moves an updated key to the newest position', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    setNewest(map, 'a', 3);

    expect(map.keys().toArray()).toEqual(['b', 'a']);
    expect(map.get('a')).toBe(3);
  });

  test('leaves the oldest entry eligible for eviction for a new key', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    setNewest(map, 'c', 3);
    capMap(map, 2);

    expect(map.keys().toArray()).toEqual(['b', 'c']);
  });
});
