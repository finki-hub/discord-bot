import { expect, test, vi } from 'vitest';

import { getLink, getQuestion } from '@/modules/faq/utils/api.js';

const parseRequestUrl = (input: Parameters<typeof fetch>[0]): URL => {
  if (typeof input === 'string') return new URL(input);
  return input instanceof URL ? input : new URL(input.url);
};

const question = (name: string) => ({
  content: 'Answer',
  created_at: '2026-01-01T00:00:00.000Z',
  id: 'question-id',
  links: null,
  name,
  updated_at: '2026-01-01T00:00:00.000Z',
  user_id: null,
});

const link = (name: string) => ({
  created_at: '2026-01-01T00:00:00.000Z',
  description: null,
  id: 'link-id',
  name,
  updated_at: '2026-01-01T00:00:00.000Z',
  url: 'example.com',
  user_id: null,
});

test('encodes question names that contain URL delimiters', async () => {
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  const name = 'Дали има онлајн настава или онлајн полагање испити?';
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json(question(name)),
  );
  vi.stubGlobal('fetch', fetchMock);

  const result = await getQuestion(name);

  const input = fetchMock.mock.calls[0]?.[0] ?? '';
  expect(parseRequestUrl(input).pathname).toBe(
    `/questions/name/${encodeURIComponent(name)}`,
  );
  expect(result?.name).toBe(name);
});

test('encodes link names that contain URL delimiters', async () => {
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  const name = 'Courses / Курсеви';
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(link(name)));
  vi.stubGlobal('fetch', fetchMock);

  const result = await getLink(name);

  const input = fetchMock.mock.calls[0]?.[0] ?? '';
  expect(parseRequestUrl(input).pathname).toBe(
    `/links/name/${encodeURIComponent(name)}`,
  );
  expect(result?.name).toBe(name);
});
