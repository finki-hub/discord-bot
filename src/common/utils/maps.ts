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
