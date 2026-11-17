import { expect, test } from 'vitest';

import { createAutocompleteOptions } from '@/common/commands/autocomplete.js';

const MAX_CHOICE_LENGTH = 100;

test('filters, deduplicates, and maps to choices', () => {
  const options = createAutocompleteOptions(
    [
      ['Learnify', 'Learnify'],
      ['learnify', 'Learnify'],
      ['Архива', 'Архива'],
    ],
    'learn',
  );

  expect(options).toEqual([{ name: 'Learnify', value: 'Learnify' }]);
});

test('keeps at most 25 choices', () => {
  const options = createAutocompleteOptions(
    Array.from({ length: 30 }, (_, index) => [
      `Question ${index}`,
      `Question ${index}`,
    ]),
    'question',
  );

  expect(options).toHaveLength(25);
});

test('truncates names and values that exceed the Discord limits', () => {
  const longName = `${'а'.repeat(99)} прашање што продолжува и понатаму`;

  const [option] = createAutocompleteOptions([[longName, longName]], 'прашање');

  expect(option?.name).toHaveLength(MAX_CHOICE_LENGTH);
  expect(option?.name.endsWith('…')).toBe(true);
  expect(option?.value).toHaveLength(MAX_CHOICE_LENGTH);
  expect(option?.value).toBe(longName.slice(0, MAX_CHOICE_LENGTH));
});

test('keeps names at the limit untouched', () => {
  const name = 'а'.repeat(MAX_CHOICE_LENGTH);

  const [option] = createAutocompleteOptions([[name, name]], '');

  expect(option).toEqual({ name, value: name });
});
