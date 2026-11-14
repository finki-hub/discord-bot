import { expect, test } from 'vitest';

import { formatLogLine } from '@/common/logger/format.js';

test('appends structured metadata to the log line', () => {
  expect(
    formatLogLine({
      guildId: '123',
      level: 'info',
      message: 'Prompt answered',
      responseId: 'response',
      timestamp: '2026-01-01 00:00:00',
    }),
  ).toBe(
    '2026-01-01 00:00:00 - info: Prompt answered {"guildId":"123","responseId":"response"}',
  );
});

test('omits absent metadata', () => {
  expect(
    formatLogLine({
      guildId: undefined,
      level: 'warn',
      message: 'No data',
      timestamp: '2026-01-01 00:00:00',
    }),
  ).toBe('2026-01-01 00:00:00 - warn: No data');
});
