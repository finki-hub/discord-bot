const transformations = {
  а: ['a'],
  А: ['A'],
  б: ['b'],
  Б: ['B'],
  в: ['v'],
  В: ['V'],
  г: ['g'],
  Г: ['G'],
  ѓ: ['g', 'gj'],
  Ѓ: ['G', 'GJ'],
  д: ['d'],
  Д: ['D'],
  е: ['e'],
  Е: ['E'],
  ж: ['z', 'zh'],
  Ж: ['Z', 'ZH'],
  з: ['z'],
  З: ['Z'],
  ѕ: ['z', 'dz'],
  Ѕ: ['Z', 'DZ'],
  и: ['i'],
  И: ['I'],
  ј: ['j'],
  Ј: ['J'],
  к: ['k'],
  К: ['K'],
  ќ: ['k', 'kj'],
  Ќ: ['K', 'KJ'],
  л: ['l'],
  Л: ['L'],
  љ: ['l', 'lj'],
  Љ: ['L', 'LJ'],
  м: ['m'],
  М: ['M'],
  н: ['n'],
  Н: ['N'],
  њ: ['n', 'nj'],
  Њ: ['N', 'NJ'],
  о: ['o'],
  О: ['O'],
  п: ['p'],
  П: ['P'],
  р: ['r'],
  Р: ['R'],
  с: ['s'],
  С: ['S'],
  т: ['t'],
  Т: ['T'],
  у: ['u'],
  У: ['U'],
  ф: ['f'],
  Ф: ['F'],
  х: ['h'],
  Х: ['H'],
  ц: ['c'],
  Ц: ['C'],
  ч: ['c', 'ch'],
  Ч: ['C', 'CH'],
  џ: ['d', 'dz', 'dzh', 'dj'],
  Џ: ['D', 'DZ', 'DZH', 'DJ'],
  ш: ['s', 'sh'],
  Ш: ['S', 'SH'],
};

const transform = (word: string) => {
  const suffixes = word.length === 1 ? [''] : transform(word.slice(1));

  const transformed: string[] = [];

  // @ts-expect-error -- indexing by runtime character may return undefined; nullish coalescing intentionally falls back to the original character
  for (const letter of transformations[word[0]] ?? word[0]) {
    for (const suffix of suffixes) {
      transformed.push(letter + suffix);
    }
  }

  return transformed;
};

export const createTransliterationSearchMap = (options: string[]) => {
  const results: Record<string, string> = {};

  for (const option of options) {
    for (const transformedOption of transform(option)) {
      results[transformedOption] = option;
    }

    results[option] = option;
  }

  return results;
};

export const createTransliterationSearchMapFromEntries = (
  entries: Array<[string, string]>,
) => {
  const results: Record<string, string> = {};

  for (const [searchTerm, canonicalName] of entries) {
    for (const transformedOption of transform(searchTerm)) {
      results[transformedOption] = canonicalName;
    }

    results[searchTerm] = canonicalName;
  }

  return results;
};
