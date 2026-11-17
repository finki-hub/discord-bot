import { expect, test, vi } from 'vitest';

const loadApi = async () => {
  vi.resetModules();
  return import('@/modules/faq/utils/api.js');
};

const startClock = () => {
  let now = Temporal.Instant.from('2026-01-01T00:00:00Z').epochMilliseconds;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  return {
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
};

test('backs off after a failed lookup when nothing is cached', async () => {
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  const clock = startClock();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(null, { status: 500 }));
  vi.stubGlobal('fetch', fetchMock);
  const { getQuestionNames } = await loadApi();

  await expect(getQuestionNames()).resolves.toBeNull();

  clock.advance(5_000);
  await expect(getQuestionNames()).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledOnce();

  clock.advance(11_000);
  await expect(getQuestionNames()).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('serves stale names during the retry backoff', async () => {
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  const clock = startClock();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(['Прво', 'Второ']))
    .mockResolvedValue(Response.json(null, { status: 500 }));
  vi.stubGlobal('fetch', fetchMock);
  const { getQuestionNames } = await loadApi();

  await expect(getQuestionNames()).resolves.toEqual(['Прво', 'Второ']);

  clock.advance(61_000);
  await expect(getQuestionNames()).resolves.toEqual(['Прво', 'Второ']);
  await expect(getQuestionNames()).resolves.toEqual(['Прво', 'Второ']);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
