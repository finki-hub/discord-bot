import assert from 'node:assert/strict';

import { logger } from '../../../src/common/logger/index.js';
import {
  ModelCatalogResponseSchema,
  type ModelAvailability,
  formatModelLabel,
} from '../../../src/modules/chat/schemas/Model.js';
import { execute as autocomplete } from '../../../src/modules/chat/commands/autocomplete/chat.js';
import {
  getSupportedModels,
  getValidatedInferenceModel,
  invalidateModelCatalog,
} from '../../../src/modules/chat/utils/requests.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const SPONSORED_MODEL_ID = 'gemini-3.1-pro-preview';
const SECRET = 'sponsored-secret';
const ENDPOINT = 'https://sponsored.invalid/v1';

type CatalogPayload = {
  readonly models: readonly Record<string, unknown>[];
  readonly source: 'live';
  readonly version: 1;
};

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

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

const run = async (): Promise<void> => {
  const originalFetch = globalThis.fetch;
  const originalLoggerSilent = logger.silent;
  const catalogs = new Map<string, CatalogPayload>();
  let catalogFetches = 0;

  if (!('Temporal' in globalThis)) {
    Object.defineProperty(globalThis, 'Temporal', {
      configurable: true,
      value: {
        Now: {
          instant: () => ({ toString: () => '2026-07-18 00:00:00Z' }),
        },
      },
    });
  }

  process.env['CHATBOT_URL'] = 'https://chatbot.invalid';
  process.env['API_KEY'] = 'discord-api-key';
  logger.silent = true;
  globalThis.fetch = async (input) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );

    if (url.pathname === '/chat/state/users') {
      return jsonResponse({
        id: USER_ID,
        provider: 'discord',
        provider_subject: 'discord-user',
      });
    }

    if (url.pathname === '/chat/models') {
      const userId = url.searchParams.get('user_id');
      assert.ok(userId);
      catalogFetches++;
      const catalog = catalogs.get(userId);
      assert.ok(catalog);
      return jsonResponse(catalog);
    }

    throw new Error(`Unexpected request URL: ${url}`);
  };

  try {
    const legacy = ModelCatalogResponseSchema.parse({
      models: [{ id: 'legacy-model', name: 'Legacy', provider: 'google' }],
      source: 'live',
      version: 1,
    });
    assert.equal(legacy.models[0]?.availability, undefined);
    assert.equal(legacy.models[0]?.sponsored_quota, undefined);

    const parsedWithSecrets = ModelCatalogResponseSchema.parse(
      catalogFor('sponsored'),
    );
    assert.deepEqual(parsedWithSecrets.models[0], {
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
    assert.throws(() =>
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
    );

    const variants: readonly ModelAvailability[] = [
      'byok',
      'sponsored',
      'both',
      'unavailable',
    ];
    const variantResults: Record<string, unknown> = {};

    for (const [index, availability] of variants.entries()) {
      catalogs.set(USER_ID, catalogFor(availability));
      invalidateModelCatalog(USER_ID);

      const catalog = await getSupportedModels(USER_ID);
      assert.ok(catalog);
      const model = catalog.models[0];
      assert.ok(model);

      const autocompleteInteraction = {
        options: {
          getFocused: () => ({ name: 'inference-model', value: '' }),
        },
        respond: async (choices: readonly { name: string; value: string }[]) => {
          variantResults[`${availability}-choices`] = choices;
        },
        user: {
          avatarURL: () => null,
          displayName: 'Driver User',
          id: `discord-${index}`,
        },
      };
      await autocomplete(autocompleteInteraction);

      const choices = variantResults[`${availability}-choices`];
      assert.ok(Array.isArray(choices));
      assert.equal(choices.length, 25);
      assert.equal(
        choices.some((choice) => choice.value === SPONSORED_MODEL_ID),
        availability !== 'unavailable',
      );
      assert.equal(formatModelLabel(model).length <= 100, true);
      if (availability === 'sponsored' || availability === 'both') {
        assert.match(formatModelLabel(model), /Бесплатно/);
        assert.match(formatModelLabel(model), /Преостанато: 4\/5/);
      } else {
        assert.equal(formatModelLabel(model).includes('Бесплатно'), false);
      }

      assert.equal(
        await getValidatedInferenceModel(USER_ID, SPONSORED_MODEL_ID),
        availability === 'unavailable' ? undefined : SPONSORED_MODEL_ID,
      );
      variantResults[availability] = {
        choiceCount: choices.length,
        sponsoredModelAccepted: availability !== 'unavailable',
        label: formatModelLabel(model),
      };
    }

    const cachedUser = '00000000-0000-4000-8000-000000000099';
    catalogs.set(cachedUser, catalogFor('byok'));
    invalidateModelCatalog(cachedUser);
    await getSupportedModels(cachedUser);
    await getSupportedModels(cachedUser);
    assert.equal(catalogFetches, variants.length + 1);
    invalidateModelCatalog(cachedUser);
    await getSupportedModels(cachedUser);
    assert.equal(catalogFetches, variants.length + 2);

    console.log(
      JSON.stringify(
        {
          catalogFetches,
          legacyPayload: 'parsed',
          secretFieldsStripped: true,
          variants: variantResults,
        },
        null,
        2,
      ),
    );
  } finally {
    logger.silent = originalLoggerSilent;
    globalThis.fetch = originalFetch;
  }
};

await run();
