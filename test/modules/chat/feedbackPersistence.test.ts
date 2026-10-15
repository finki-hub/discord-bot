import type { ButtonInteraction } from 'discord.js';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import { execute as rate } from '@/modules/chat/commands/button/chatFeedback.js';
import { execute as chat } from '@/modules/chat/commands/chat/chat.js';
import { FeedbackOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import {
  forgetFeedbackContexts,
  rememberFeedbackContext,
} from '@/modules/chat/utils/feedback.js';
import { clearChatUserCache } from '@/modules/chat/utils/identity.js';
import { beginChatOperation } from '@/modules/chat/utils/privacy.js';
import { sendFeedback } from '@/modules/chat/utils/requests.js';
import { commandErrors, commandResponses } from '@/translations/commands.js';

import { fakeInteraction, requestUrl } from './interactionFixture.js';

const RATER = 'new-discord-rater';
const OWNER = 'answer-author';
const USER_ID = '00000000-0000-4000-8000-000000000077';
const RESPONSE_ID = '00000000-0000-4000-8000-000000000088';
const args = ['like', RESPONSE_ID, RATER];
const originalLoggerSilent = logger.silent;
const requests: Array<{
  path: string;
  method: string | undefined;
  body: unknown;
  headers: Headers;
}> = [];

const sendRating = () =>
  sendFeedback(
    FeedbackOptionsSchema.parse({
      client: 'discord',
      feedbackType: 'like',
      responseId: RESPONSE_ID,
      userId: RATER,
    }),
  );

const button = () => {
  const driver = fakeInteraction('chatFeedback', '', RATER);
  const deferUpdate = vi.fn<() => Promise<void>>(async () => {});
  Object.assign(driver.interaction, {
    message: { id: 'answer-message' },
    channelId: 'answer-channel',
    deferUpdate,
  });
  return {
    interaction: driver.interaction as unknown as ButtonInteraction,
    state: driver.state,
    deferUpdate,
  };
};

const mockApi = (statuses: number[], firstAttempt?: () => void) => {
  let attempt = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const path = requestUrl(input).pathname;
      requests.push({
        path,
        method: init?.method,
        body:
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as unknown)
            : undefined,
        headers: new Headers(init?.headers),
      });
      if (path === '/chat/state/users') {
        return Response.json({
          id: USER_ID,
          provider: 'discord',
          provider_subject: RATER,
        });
      }
      if (path.endsWith('/history')) {
        return Response.json({ deleted_conversations: 0, deleted_feedback: 1 });
      }
      if (path !== '/chat/feedback') throw new Error('Unexpected test request');
      const status = statuses[attempt] ?? 500;
      attempt += 1;
      firstAttempt?.();
      return Response.json(
        { detail: 'PRIVATE_BACKEND_DETAIL' },
        {
          status,
          headers: status === 404 ? { 'X-Feedback-Generation': '7' } : {},
        },
      );
    }),
  );
};

beforeEach(() => {
  logger.silent = true;
  requests.length = 0;
  clearChatUserCache(RATER);
  vi.stubEnv('CHATBOT_URL', 'https://chatbot.invalid');
  vi.stubEnv('API_KEY', 'test-api-key');
  rememberFeedbackContext(RESPONSE_ID, {
    answer: 'DO_NOT_COPY_ANSWER',
    question: 'DO_NOT_COPY_QUESTION',
    conversationId: 'conversation',
    userId: OWNER,
    userIds: [OWNER],
  });
});

afterEach(() => {
  logger.silent = originalLoggerSilent;
  clearChatUserCache(RATER);
  forgetFeedbackContexts(OWNER);
});

test('registers the rater first and sends only references, never cached text or models', async () => {
  mockApi([200]);
  const driver = button();
  await rate(driver.interaction, args);
  expect(driver.deferUpdate).toHaveBeenCalledOnce();
  expect(requests.map(({ path }) => path)).toEqual([
    '/chat/state/users',
    '/chat/feedback',
  ]);
  expect(requests[0]?.body).toMatchObject({
    provider: 'discord',
    provider_subject: RATER,
  });
  expect(requests[1]?.body).toEqual({
    channel_id: 'answer-channel',
    client: 'discord',
    client_ref: 'answer-message',
    feedback_type: 'like',
    response_id: RESPONSE_ID,
    user_id: RATER,
  });
  expect(
    requests.every(
      ({ headers }) => headers.get('x-api-key') === 'test-api-key',
    ),
  ).toBe(true);
  expect(driver.state.calls[0]?.payload).toEqual({
    content: commandResponses.feedbackRecorded,
    flags: 64,
  });
  expect(driver.state.calls.at(-1)?.kind).toBe('edit');
  expect(requests[1]?.headers.has('X-Feedback-Generation')).toBe(false);
  expect(
    FeedbackOptionsSchema.parse({
      client: 'discord',
      feedbackType: 'like',
      responseId: RESPONSE_ID,
      userId: RATER,
      answerText: 'forged',
      questionText: 'forged',
      inferenceModel: 'forged',
      embeddingsModel: 'forged',
    }),
  ).not.toHaveProperty('answer_text');
});

test('only the asker can rate an answer', async () => {
  mockApi([200]);
  const driver = button();
  await rate(driver.interaction, ['like', RESPONSE_ID, OWNER]);
  expect(requests).toEqual([]);
  expect(driver.deferUpdate).not.toHaveBeenCalled();
  expect(driver.state.calls[0]?.payload).toEqual({
    content: commandErrors.buttonNoPermission,
    flags: 64,
  });
});

test('retries pending persistence 404 then succeeds without registering twice', async () => {
  mockApi([404, 200]);
  const driver = button();
  await rate(driver.interaction, args);
  expect(requests.map(({ path }) => path)).toEqual([
    '/chat/state/users',
    '/chat/feedback',
    '/chat/feedback',
  ]);
  expect(driver.state.calls[0]?.payload).toEqual({
    content: commandResponses.feedbackRecorded,
    flags: 64,
  });
  expect(driver.state.calls.at(-1)?.kind).toBe('edit');
  expect(
    requests
      .filter(({ path }) => path === '/chat/feedback')
      .map(({ headers }) => headers.get('X-Feedback-Generation')),
  ).toEqual([null, '7']);
});

test('surviving server responses remain rateable after the local cache is gone', async () => {
  forgetFeedbackContexts(OWNER);
  mockApi([200]);
  const driver = button();
  await rate(driver.interaction, args);
  expect(requests.map(({ path }) => path)).toEqual([
    '/chat/state/users',
    '/chat/feedback',
  ]);
  expect(driver.state.calls[0]?.payload).toEqual({
    content: commandResponses.feedbackRecorded,
    flags: 64,
  });
});

test.each([
  undefined,
  '',
  '00',
  '-1',
  '+1',
  '1.5',
  '7, 8',
  'invalid',
  '9'.repeat(20),
])('missing or malformed initial generation %s is terminal', async (token) => {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json(
      {},
      {
        status: 404,
        headers: token === undefined ? {} : { 'X-Feedback-Generation': token },
      },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(sendRating()).resolves.toBe('unavailable');
  expect(fetchMock).toHaveBeenCalledOnce();
});

test.each(['0', '9007199254740993', '9'.repeat(19)])(
  'echoes valid decimal generation %s without numeric conversion',
  async (token) => {
    const sent: Array<null | string> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (_input, init) => {
        sent.push(new Headers(init?.headers).get('X-Feedback-Generation'));
        return Response.json(
          {},
          sent.length === 1
            ? { status: 404, headers: { 'X-Feedback-Generation': token } }
            : { status: 200 },
        );
      }),
    );
    await expect(sendRating()).resolves.toBe('recorded');
    expect(sent).toEqual([null, token]);
  },
);

test('remote deletion between attempts returns terminal 409 without a shared local barrier', async () => {
  let serverGeneration = '7';
  let writes = 0;
  const sent: Array<null | string> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_input, init) => {
      const token = new Headers(init?.headers).get('X-Feedback-Generation');
      sent.push(token);
      if (token === null) {
        const captured = serverGeneration;
        serverGeneration = '8'; // Deletion on another bot/API process.
        return Response.json(
          {},
          { status: 404, headers: { 'X-Feedback-Generation': captured } },
        );
      }
      if (token !== serverGeneration) return Response.json({}, { status: 409 });
      writes += 1;
      return Response.json({});
    }),
  );
  await expect(sendRating()).resolves.toBe('failed');
  expect(sent).toEqual([null, '7']);
  expect(writes).toBe(0);
});

test('a later 404 cannot refresh the immutable token before a terminal conflict', async () => {
  const sent: Array<null | string> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (_input, init) => {
      const token = new Headers(init?.headers).get('X-Feedback-Generation');
      sent.push(token);
      if (sent.length < 3)
        return Response.json(
          {},
          {
            status: 404,
            headers: { 'X-Feedback-Generation': sent.length === 1 ? '7' : '8' },
          },
        );
      return Response.json({}, { status: token === '7' ? 409 : 200 });
    }),
  );
  await expect(sendRating()).resolves.toBe('failed');
  expect(sent).toEqual([null, '7', '7']);
});

test.each([undefined, 'invalid'])(
  'a later 404 without a valid retry header %s is terminal',
  async (token) => {
    const sent: Array<null | string> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (_input, init) => {
        sent.push(new Headers(init?.headers).get('X-Feedback-Generation'));
        const header = sent.length === 1 ? '7' : token;
        return Response.json(
          {},
          {
            status: 404,
            headers:
              header === undefined ? {} : { 'X-Feedback-Generation': header },
          },
        );
      }),
    );
    await expect(sendRating()).resolves.toBe('unavailable');
    expect(sent).toEqual([null, '7']);
  },
);

test('deleted or never-persisted responses stop after three 404s with a helpful private reply', async () => {
  mockApi([404, 404, 404, 200]);
  const driver = button();
  await rate(driver.interaction, args);
  expect(requests.filter(({ path }) => path === '/chat/feedback')).toHaveLength(
    3,
  );
  expect(driver.state.calls).toEqual([
    {
      kind: 'followUp',
      payload: { content: commandErrors.feedbackUnavailable, flags: 64 },
    },
  ]);
  expect(JSON.stringify(requests.map(({ body }) => body))).not.toContain(
    'DO_NOT_COPY',
  );
});

test.each([400, 401, 403, 409, 422, 429, 500, 503])(
  'does not retry HTTP %s',
  async (status) => {
    mockApi([status, 200]);
    const driver = button();
    await rate(driver.interaction, args);
    expect(
      requests.filter(({ path }) => path === '/chat/feedback'),
    ).toHaveLength(1);
    expect(driver.state.calls).toEqual([
      {
        kind: 'followUp',
        payload: { content: commandErrors.unknownChatError, flags: 64 },
      },
    ]);
  },
);

test('failed rater registration never submits feedback', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({}, { status: 503 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const driver = button();
  await rate(driver.interaction, args);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(driver.state.calls).toEqual([
    {
      kind: 'followUp',
      payload: { content: commandErrors.feedbackUnavailable, flags: 64 },
    },
  ]);
});

test('network failures are not retried or exposed to the user', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    throw new TypeError('PRIVATE_NETWORK_DETAIL');
  });
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    sendFeedback(
      FeedbackOptionsSchema.parse({
        client: 'discord',
        feedbackType: 'like',
        responseId: RESPONSE_ID,
        userId: RATER,
      }),
    ),
  ).resolves.toBe('failed');
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('the request budget aborts a stalled request without retrying', async () => {
  const controller = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(controller.signal);
  const started = Promise.withResolvers<undefined>();
  const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
    started.resolve(undefined);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          reject(new Error('timeout'));
        },
        { once: true },
      );
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const active = sendFeedback(
    FeedbackOptionsSchema.parse({
      client: 'discord',
      feedbackType: 'like',
      responseId: RESPONSE_ID,
      userId: RATER,
    }),
  );
  await started.promise;
  controller.abort();
  await expect(active).resolves.toBe('failed');
  expect(timeout).toHaveBeenCalledExactlyOnceWith(3_000);
  expect(fetchMock).toHaveBeenCalledOnce();
});

test('forget holds its fence throughout the retry gap and deletes only after feedback finalizes', async () => {
  const started = Promise.withResolvers<undefined>();
  mockApi([404, 200], () => {
    started.resolve(undefined);
  });
  const active = rate(button().interaction, args);
  await started.promise;
  const forget = fakeInteraction('chat', 'forget', RATER);
  const deletion = chat(forget.interaction);
  try {
    await vi.waitFor(
      () => {
        const finish = beginChatOperation(RATER);
        finish?.();
        expect(finish).toBeNull();
      },
      { timeout: 200, interval: 1 },
    );
    const blocked = button();
    await rate(blocked.interaction, args);
    expect(blocked.state.calls[0]?.kind).toBe('reply');
    expect(requests.some(({ method }) => method === 'DELETE')).toBe(false);
  } finally {
    // Drain before restoring fetch/environment even when an assertion fails.
    await Promise.all([active, deletion]);
  }
  expect(requests.map(({ path }) => path)).toEqual([
    '/chat/state/users',
    '/chat/feedback',
    '/chat/feedback',
    `/chat/state/users/${USER_ID}/history`,
  ]);
  expect(forget.state.ephemeral).toBe(true);
});
