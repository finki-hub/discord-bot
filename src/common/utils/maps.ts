// Map.prototype.getOrInsertComputed is not available on Node LTS yet.
export const getOrInsert = <K, V>(
  map: Map<K, V>,
  key: K,
  create: () => V,
): V => {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const value = create();
  map.set(key, value);
  return value;
};

// Map iteration follows insertion order, so the first key is the oldest entry.
export const capMap = <K, V>(map: Map<K, V>, maxSize: number): void => {
  while (map.size > maxSize) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) return;
    map.delete(oldestKey);
  }
};
