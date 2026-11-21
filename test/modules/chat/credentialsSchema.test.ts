import { describe, expect, test } from 'vitest';

import { CredentialUpsertSchema } from '@/modules/chat/schemas/Credentials.js';

const credential = (baseUrl?: string) => ({
  api_key: 'test-api-key',
  ...(baseUrl !== undefined && { base_url: baseUrl }),
  provider: 'ollama' as const,
});

describe('credential upsert schema', () => {
  test('accepts HTTPS base URLs', () => {
    expect(
      CredentialUpsertSchema.safeParse(
        credential('https://ollama.example.com:11434'),
      ).success,
    ).toBe(true);
  });

  test.each([
    'http://169.254.169.254',
    'http://localhost:11434',
    'ftp://example.com',
  ])('rejects the non-HTTPS base URL %s', (baseUrl) => {
    expect(CredentialUpsertSchema.safeParse(credential(baseUrl)).success).toBe(
      false,
    );
  });
});
