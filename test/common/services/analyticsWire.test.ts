import type { PostHog, PostHogOptions } from 'posthog-node';
import type * as PostHogSdk from 'posthog-node';

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const revision = '0123456789abcdef0123456789abcdef01234567';
const sentinel = 'PRIVATE_ERROR_SENTINEL';
const clients: PostHog[] = [];
const bodies: string[] = [];
const optionsUsed: PostHogOptions[] = [];
const blockedFetch = vi.fn<() => never>(() => {
  throw new Error('Unexpected network access');
});
const logs = {
  debug: vi.fn<() => void>(),
  error: vi.fn<() => void>(),
  info: vi.fn<() => void>(),
  warn: vi.fn<() => void>(),
};
type Handler = (error?: unknown) => Promise<void> | void;
const handlers = new Map<string | symbol, Handler>();

beforeEach(async () => {
  vi.resetModules();
  bodies.length = 0;
  optionsUsed.length = 0;
  handlers.clear();
  vi.stubGlobal('fetch', blockedFetch);
  vi.stubGlobal('__APP_REVISION__', revision);
  vi.stubEnv('POSTHOG_KEY', 'fake-offline-key');
  vi.stubEnv('POSTHOG_SALT', 'test-salt');
  vi.stubEnv('POSTHOG_HOST', 'https://analytics.example.test');
  const actual = await vi.importActual<typeof PostHogSdk>('posthog-node');
  vi.doMock('posthog-node', () => ({
    ...actual,
    PostHog: class extends actual.PostHog {
      constructor(key: string, options: PostHogOptions) {
        optionsUsed.push(options);
        super(key, {
          ...options,
          fetch: (_url, request) => {
            bodies.push(
              typeof request.body === 'string'
                ? request.body
                : gunzipSync(request.body as Uint8Array).toString('utf8'),
            );
            return Promise.resolve(new Response('{}', { status: 200 }));
          },
        });
        clients.push(this);
      }
    },
  }));
  vi.doMock('@/common/logger/index.js', () => ({ logger: logs }));
});

afterEach(async () => {
  const activeClients = [...clients];
  clients.length = 0;
  try {
    await Promise.all(
      activeClients.map(async (client) => client.shutdown(2_000)),
    );
  } finally {
    vi.doUnmock('posthog-node');
    vi.doUnmock('@/common/logger/index.js');
    vi.resetModules();
  }
});

const assertWire = (
  category: string,
  distinctId = 'discord-bot',
  phase: null | string = null,
) => {
  expect(blockedFetch).not.toHaveBeenCalled();
  expect(optionsUsed).toHaveLength(1);
  expect(optionsUsed[0]?.enableExceptionAutocapture).toBe(false);
  const events = bodies.flatMap(
    (body) =>
      (
        JSON.parse(body) as {
          batch: Array<{ event: string; properties: Record<string, unknown> }>;
        }
      ).batch,
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    distinct_id: distinctId,
    event: '$exception',
    properties: {
      $process_person_profile: false,
      app_revision: revision,
      error_type: category,
      phase,
      service: 'discord-bot',
    },
  });
  expect(events[0]?.properties['$exception_list']).toStrictEqual([
    {
      mechanism: {
        exception_id: 0,
        handled: true,
        synthetic: false,
        type: 'generic',
      },
      stacktrace: { frames: [], type: 'raw' },
      type: 'Error',
      value: category,
    },
  ]);
  const wire = JSON.stringify([
    bodies,
    Object.values(logs).map((log) => log.mock.calls),
  ]);
  for (const forbidden of [
    sentinel,
    'spoofed',
    'filename',
    'lineno',
    'colno',
    'context_line',
    'pre_context',
    'post_context',
    'privateFunction',
    'discord-user',
  ]) {
    expect(wire).not.toContain(forbidden);
  }
  return events[0]?.properties;
};

test.each([
  ['error', Error],
  ['type_error', TypeError],
  ['range_error', RangeError],
  ['unknown', undefined],
] as const)(
  'real SDK serializes %s without private error data or frames',
  async (category, Constructor) => {
    const analytics = await import('@/common/services/analytics.js');
    const uncaughtListeners = process.listeners('uncaughtException');
    const rejectionListeners = process.listeners('unhandledRejection');
    analytics.initAnalytics();
    expect(process.listeners('uncaughtException')).toStrictEqual(
      uncaughtListeners,
    );
    expect(process.listeners('unhandledRejection')).toStrictEqual(
      rejectionListeners,
    );
    const error =
      Constructor === undefined
        ? sentinel
        : new Constructor(sentinel, { cause: new Error(sentinel) });
    if (error instanceof Error) {
      Object.assign(error, {
        name: sentinel,
        stack: `Error: ${sentinel}\n    at privateFunction (/private/${sentinel}.js:42:7)`,
        headers: { authorization: sentinel },
        body: { private: sentinel },
        url: `https://private.example/${sentinel}`,
      });
    }
    const props = {
      command: sentinel,
      surface: sentinel,
      app_revision: 'spoofed',
      headers: { cookie: sentinel },
    };
    analytics.captureException(error, 'discord-user', props);
    await analytics.shutdownAnalytics();
    const properties = assertWire(
      category,
      createHash('sha256').update('test-saltdiscord-user').digest('hex'),
    );
    expect(properties).toMatchObject({
      command: 'unknown',
      surface: 'unknown',
    });
  },
);

test.each([
  ['chat query command', 'interaction'],
  ['Prompt context command', 'reply'],
  ['chat conversation continuation', 'thread'],
])(
  'preserves registered exception context %s / %s',
  async (command, surface) => {
    const analytics = await import('@/common/services/analytics.js');
    analytics.initAnalytics();
    analytics.captureException(new Error(sentinel), null, { command, surface });
    await analytics.shutdownAnalytics();
    expect(assertWire('error')).toMatchObject({ command, surface });
  },
);

test.each(['uncaughtException', 'unhandledRejection'] as const)(
  '%s before analytics initialization keeps safe fatal diagnostics',
  async (event) => {
    vi.spyOn(process, 'on').mockImplementation((name, handler) => {
      handlers.set(name, handler as Handler);
      return process;
    });
    const exit = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    const { attachProcessListeners } = await import('@/core/utils/process.js');
    attachProcessListeners();
    await handlers.get(event)?.(new Error(sentinel));
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(logs.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs.error.mock.calls)).not.toContain(sentinel);
    expect(bodies).toHaveLength(0);
    expect(blockedFetch).not.toHaveBeenCalled();
  },
);

test.each(['uncaughtException', 'unhandledRejection'] as const)(
  'owned %s handler reports safe wire data then exits with code 1',
  async (event) => {
    const analytics = await import('@/common/services/analytics.js');
    analytics.initAnalytics();
    vi.spyOn(process, 'on').mockImplementation((name, handler) => {
      expect(handlers.has(name)).toBe(false);
      handlers.set(name, handler as Handler);
      return process;
    });
    const exit = vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    const { attachProcessListeners } = await import('@/core/utils/process.js');
    attachProcessListeners();
    expect(handlers.size).toBe(7);
    const fatalHandler = handlers.get(event);
    expect(fatalHandler).toBeDefined();
    await fatalHandler?.(
      new TypeError(sentinel, { cause: new Error(sentinel) }),
    );
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    assertWire(
      'type_error',
      'discord-bot',
      event === 'uncaughtException'
        ? 'uncaught_exception'
        : 'unhandled_rejection',
    );
  },
);
