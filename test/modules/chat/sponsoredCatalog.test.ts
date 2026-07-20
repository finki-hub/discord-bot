import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import { execute as autocomplete } from '@/modules/chat/commands/autocomplete/chat.js';
import {
  formatModelLabel,
  type ModelAvailability,
  ModelCatalogResponseSchema,
} from '@/modules/chat/schemas/Model.js';
import {
  getSupportedModels,
  getValidatedInferenceModel,
  invalidateModelCatalog,
} from '@/modules/chat/utils/requests.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const CACHED_USER_ID = '00000000-0000-4000-8000-000000000099';
const SPONSORED_MODEL_ID = 'gemini-3.1-pro-preview';
const SECRET = 'sponsored-secret';
const ENDPOINT = 'https://sponsored.invalid/v1';
const FREE_LABEL = 'Бесплатно';
const QUOTA_LABEL = 'Преостанато: 4/5';

type CatalogPayload = {
  readonly models: ReadonlyArray<Record<string, unknown>>;
  readonly source: 'live';
  readonly version: 1;
};

const availabilityCases = [
  { availability: 'byok', selectable: true, sponsored: false },
  { availability: 'sponsored', selectable: true, sponsored: true },
  { availability: 'both', selectable: true, sponsored: true },
  { availability: 'unavailable', selectable: false, sponsored: false },
] as const satisfies ReadonlyArray<{
  readonly availability: ModelAvailability;
  readonly selectable: boolean;
  readonly sponsored: boolean;
}>;

const catalogFor = (availability: ModelAvailability): CatalogPayload => ({
  models: [
    {
      api_key: SECRET,
      availability,
      base_url: ENDPOINT,
      id: SPONSORED_MODEL_ID,
      name: 'Gemini 3.1 Pro Preview',
      provider: 'google',
      sponsored_quota:
        availability === 'sponsored' || availability === 'both'
          ? {
              limit: 5,
              remaining: 4,
              resets_at: '2026-07-19T00:00:00Z',
            }
          : null,
    },
    ...Array.from({ length: 29 }, (_, index) => ({
      id: `model-${index}`,
      name: `Model ${index}`,
      provider: 'google',
    })),
  ],
  source: 'live',
  version: 1,
});

const jsonResponse = (body: unknown): Response => Response.json(body);

const requestUrl = (input: Parameters<typeof fetch>[0]): URL => {
  if (typeof input === 'string') {
    return new URL(input);
  }
  if (input instanceof URL) {
    return input;
  }
  return new URL(input.url);
};

describe('sponsored model catalog', () => {
  const originalLoggerSilent = logger.silent;
  let catalogs: Map<string, CatalogPayload>;
  let catalogFetches: number;

  beforeEach(() => {
    catalogs = new Map();
    catalogFetches = 0;
    logger.silent = true;
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
    vi.stubEnv('API_KEY', 'discord-api-key');
    invalidateModelCatalog(USER_ID);
    invalidateModelCatalog(CACHED_USER_ID);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = requestUrl(input);

        if (url.pathname === '/chat/state/users') {
          return jsonResponse({
            id: USER_ID,
            provider: 'discord',
            provider_subject: 'discord-user',
          });
        }

        if (url.pathname === '/chat/models') {
          const userId = url.searchParams.get('user_id');
          if (userId === null) {
            throw new Error('Expected a user_id query parameter');
          }
          catalogFetches++;
          const catalog = catalogs.get(userId);
          if (catalog === undefined) {
            throw new Error(`Missing catalog for ${userId}`);
          }
          return jsonResponse(catalog);
        }

        throw new Error(`Unexpected request URL: ${url.href}`);
      }),
    );
  });

  afterEach(() => {
    invalidateModelCatalog(USER_ID);
    invalidateModelCatalog(CACHED_USER_ID);
    logger.silent = originalLoggerSilent;
  });

  test('parses legacy catalogs without sponsored metadata', () => {
    const legacy = ModelCatalogResponseSchema.parse({
      models: [{ id: 'legacy-model', name: 'Legacy', provider: 'google' }],
      source: 'live',
      version: 1,
    });

    expect(legacy.models[0]?.availability).toBeUndefined();
    expect(legacy.models[0]?.sponsored_quota).toBeUndefined();
  });

  test('strips provider secrets and rejects impossible quota values', () => {
    const parsed = ModelCatalogResponseSchema.parse(catalogFor('sponsored'));

    expect(parsed.models[0]).toEqual({
      availability: 'sponsored',
      id: SPONSORED_MODEL_ID,
      name: 'Gemini 3.1 Pro Preview',
      provider: 'google',
      sponsored_quota: {
        limit: 5,
        remaining: 4,
        resets_at: '2026-07-19T00:00:00Z',
      },
    });
    expect(() =>
      ModelCatalogResponseSchema.parse({
        ...catalogFor('sponsored'),
        models: [
          {
            ...catalogFor('sponsored').models[0],
            sponsored_quota: {
              limit: 5,
              remaining: 6,
              resets_at: '2026-07-19T00:00:00Z',
            },
          },
        ],
      }),
    ).toThrow();
  });

  test.each(availabilityCases)(
    'presents and validates $availability models consistently',
    async ({ availability, selectable, sponsored }) => {
      catalogs.set(USER_ID, catalogFor(availability));

      const catalog = await getSupportedModels(USER_ID);
      expect(catalog).not.toBeNull();
      const model = catalog?.models[0];
      expect(model).toBeDefined();
      if (model === undefined) {
        throw new Error('Expected the sponsored model in the catalog');
      }

      let choices: ReadonlyArray<{
        readonly name: string;
        readonly value: string;
      }> = [];
      const interaction = {
        options: {
          getFocused: () => ({ name: 'inference-model', value: '' }),
        },
        respond: async (
          response: ReadonlyArray<{
            readonly name: string;
            readonly value: string;
          }>,
        ) => {
          choices = response;
        },
        user: {
          avatarURL: () => null,
          displayName: 'Driver User',
          id: `discord-${availability}`,
        },
      } as unknown as Parameters<typeof autocomplete>[0];

      await autocomplete(interaction);

      expect(choices).toHaveLength(25);
      expect(
        choices.some((choice) => choice.value === SPONSORED_MODEL_ID),
      ).toBe(selectable);
      const label = formatModelLabel(model);
      expect(label.length).toBeLessThanOrEqual(100);
      expect(label.includes(FREE_LABEL)).toBe(sponsored);
      expect(label.includes(QUOTA_LABEL)).toBe(sponsored);
      await expect(
        getValidatedInferenceModel(USER_ID, SPONSORED_MODEL_ID),
      ).resolves.toBe(selectable ? SPONSORED_MODEL_ID : 'model-0');
    },
  );

  test('caches catalogs per user until invalidated', async () => {
    catalogs.set(CACHED_USER_ID, catalogFor('byok'));

    await getSupportedModels(CACHED_USER_ID);
    await getSupportedModels(CACHED_USER_ID);
    expect(catalogFetches).toBe(1);

    invalidateModelCatalog(CACHED_USER_ID);
    await getSupportedModels(CACHED_USER_ID);
    expect(catalogFetches).toBe(2);
  });
});
