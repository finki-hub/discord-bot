import { describe, expect, test } from 'vitest';

import { createAutocompleteOptions } from '@/common/commands/autocomplete.js';
import { createTransliterationSearchMap } from '@/common/utils/transliteration.js';
import { compareSessionsNewestFirst } from '@/modules/session/utils/order.js';

const sessions = [
  '2025/2026 Зимски - Прв Колоквиум',
  '2024/2025 Јануари',
  '2025/2026 Септември',
  '2026/2027 Зимски - Прв Колоквиум',
  '2025/2026 Јануари',
  '2025/2026 Летен - Прв Колоквиум',
  '2025/2026 Летен - Втор Колоквиум',
  '2025/2026 Јуни',
  '2025/2026 Зимски - Втор Колоквиум',
];

const newestFirst = [
  '2026/2027 Зимски - Прв Колоквиум',
  '2025/2026 Септември',
  '2025/2026 Јуни',
  '2025/2026 Летен - Втор Колоквиум',
  '2025/2026 Летен - Прв Колоквиум',
  '2025/2026 Јануари',
  '2025/2026 Зимски - Втор Колоквиум',
  '2025/2026 Зимски - Прв Колоквиум',
  '2024/2025 Јануари',
];

describe('the exam session order', () => {
  test('puts the newest year and its latest session first', () => {
    expect(sessions.toSorted(compareSessionsNewestFirst)).toEqual(newestFirst);
  });

  test('is the order /session suggests, also when filtered', () => {
    const options = Object.entries(
      createTransliterationSearchMap(
        sessions.toSorted(compareSessionsNewestFirst),
      ),
    );

    expect(
      createAutocompleteOptions(options, '').map(({ name }) => name),
    ).toEqual(newestFirst);
    expect(
      createAutocompleteOptions(options, 'Јануари').map(({ name }) => name),
    ).toEqual(['2025/2026 Јануари', '2024/2025 Јануари']);
  });
});
