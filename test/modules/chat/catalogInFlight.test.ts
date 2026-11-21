import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import {
  getSupportedModels,
  invalidateModelCatalog,
} from '@/modules/chat/utils/requests.js';

const USER_ID = '00000000-0000-4000-8000-000000000012';

const catalog = {
  models: [{ id: 'model-1', name: 'Model One', provider: 'openai' }],
  source: 'live',
  version: 1,
};

describe('model catalog requests', () => {
  const originalLoggerSilent = logger.silent;

  beforeEach(() => {
    logger.silent = true;
    vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
    vi.stubEnv('API_KEY', 'test-api-key');
    invalidateModelCatalog(USER_ID);
  });

  afterEach(() => {
    invalidateModelCatalog(USER_ID);
    logger.silent = originalLoggerSilent;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test('shares one catalog request between concurrent callers', async () => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    const fetchMock = vi.fn<typeof fetch>(async () => promise);
    vi.stubGlobal('fetch', fetchMock);

    const first = getSupportedModels(USER_ID);
    const second = getSupportedModels(USER_ID);

    expect(fetchMock).toHaveBeenCalledOnce();

    resolve(Response.json(catalog));

    await expect(first).resolves.toEqual(catalog);
    await expect(second).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
