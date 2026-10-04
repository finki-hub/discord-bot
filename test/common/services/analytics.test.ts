import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { logger } from '@/common/logger/index.js';
import {
  captureException,
  initAnalytics,
  shutdownAnalytics,
  trackCommandInvoked,
  trackInteraction,
  trackLifecycle,
  trackMessageAnswered,
} from '@/common/services/analytics.js';

type CaptureExceptionMock = (
  error: Error,
  distinctId: string,
  properties: Record<string, unknown>,
) => void;

const postHog = vi.hoisted(() => ({
  capture: vi.fn<(event: unknown) => void>(),
  captureException: vi.fn<CaptureExceptionMock>(),
  shutdown: vi.fn<() => Promise<void>>(async () => {}),
}));

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture = postHog.capture;
    captureException = postHog.captureException;
    shutdown = postHog.shutdown;
  },
}));

test('Winston leaves fatal exceptions to the owned safe process handlers', () => {
  expect(
    logger.transports.every((transport) => !transport.handleExceptions),
  ).toBe(true);
});

describe('analytics exception capture', () => {
  beforeEach(() => {
    vi.stubEnv('POSTHOG_KEY', 'test-key');
    vi.stubEnv('POSTHOG_SALT', 'test-salt');
    vi.stubGlobal('__APP_REVISION__', undefined);
    postHog.capture.mockClear();
    postHog.captureException.mockClear();
    postHog.shutdown.mockClear();
    initAnalytics();
  });

  afterEach(async () => {
    await shutdownAnalytics();
  });

  test('uses SDK exception capture without exposing the original message', () => {
    vi.stubGlobal('__APP_REVISION__', 'a'.repeat(40));
    const error = Object.defineProperty(
      new Error('provider-secret global_limit=100'),
      'name',
      { value: 'ProviderError' },
    );

    captureException(error, 'discord-user', {
      command: 'chat query command',
      surface: 'interaction',
    });

    expect(postHog.capture).not.toHaveBeenCalled();
    expect(postHog.captureException).toHaveBeenCalledOnce();
    const [capturedError, distinctId, properties] =
      postHog.captureException.mock.calls[0] ?? [];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).toMatchObject({
      message: 'error',
      name: 'Error',
    });
    expect(capturedError?.stack).not.toContain('provider-secret');
    expect(distinctId).toBe(
      createHash('sha256').update('test-saltdiscord-user').digest('hex'),
    );
    expect(properties).toEqual({
      app_revision: 'a'.repeat(40),
      $process_person_profile: false,
      command: 'chat query command',
      error_type: 'error',
      phase: null,
      service: 'discord-bot',
      surface: 'interaction',
    });
  });

  test.each([
    ['a'.repeat(40), 'a'.repeat(40)],
    [undefined, undefined],
    ['', undefined],
    ['a'.repeat(39), undefined],
    ['a'.repeat(41), undefined],
    ['A'.repeat(40), undefined],
    ['g'.repeat(40), undefined],
    [`${'a'.repeat(40)}\n`, undefined],
    [42, undefined],
  ])('attaches only a validated build revision: %s', (revision, expected) => {
    vi.stubGlobal('__APP_REVISION__', revision);
    vi.stubEnv('APP_REVISION', 'c'.repeat(40));
    const extraProps = {
      app_revision: 'b'.repeat(40),
      message: 'private-message-sentinel',
      args: 'private-args-sentinel',
    };
    const chatProps = {
      ...extraProps,
      channelId: null,
      command: 'ask',
      guildId: null,
      surface: 'dm',
    };
    trackCommandInvoked('discord-user', chatProps);
    trackMessageAnswered('discord-user', { ...chatProps, responseId: null });
    trackInteraction('discord-user', {
      ...extraProps,
      command: 'ask',
      durationMs: 12,
      errorType: 'ProviderError',
      module: 'chat',
      outcome: 'error',
      surface: 'dm',
      type: 'chat',
    });
    trackLifecycle('ready', { ...extraProps, guildCount: 2, memberCount: 3 });
    captureException(new Error('private-error-sentinel'), null, chatProps);

    const revisionProps =
      expected === undefined ? {} : { app_revision: expected };
    const distinctId = createHash('sha256')
      .update('test-saltdiscord-user')
      .digest('hex');
    expect(postHog.capture.mock.calls).toEqual([
      [
        {
          distinctId,
          event: 'command_invoked',
          properties: {
            channel_id: null,
            command: 'ask',
            guild_id: null,
            service: 'discord-bot',
            surface: 'dm',
            ...revisionProps,
          },
        },
      ],
      [
        {
          distinctId,
          event: 'message_answered',
          properties: {
            channel_id: null,
            command: 'ask',
            guild_id: null,
            response_id: null,
            service: 'discord-bot',
            surface: 'dm',
            ...revisionProps,
          },
        },
      ],
      [
        {
          distinctId,
          event: 'interaction',
          properties: {
            command: 'ask',
            duration_ms: 12,
            error_type: 'ProviderError',
            module: 'chat',
            outcome: 'error',
            service: 'discord-bot',
            surface: 'dm',
            type: 'chat',
            ...revisionProps,
          },
        },
      ],
      [
        {
          distinctId: 'discord-bot',
          event: 'ready',
          properties: {
            guild_count: 2,
            member_count: 3,
            service: 'discord-bot',
            ...revisionProps,
          },
        },
      ],
    ]);
    expect(postHog.captureException).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: 'error',
        name: 'Error',
        stack: 'Error: error',
      }),
      'discord-bot',
      {
        $process_person_profile: false,
        command: 'unknown',
        error_type: 'error',
        phase: null,
        service: 'discord-bot',
        surface: 'unknown',
        ...revisionProps,
      },
    );
    const captured = JSON.stringify([
      postHog.capture.mock.calls,
      postHog.captureException.mock.calls,
    ]);
    expect(captured).not.toContain('private-');
    expect(captured).not.toContain('test-key');
    expect(captured).not.toContain('test-salt');
  });

  test('stays disabled without a key even when a revision is present', async () => {
    await shutdownAnalytics();
    vi.stubEnv('POSTHOG_KEY', '');
    vi.stubGlobal('__APP_REVISION__', 'a'.repeat(40));
    initAnalytics();
    trackLifecycle('ready');
    captureException(new Error('private-error-sentinel'), null);
    expect(postHog.capture).not.toHaveBeenCalled();
    expect(postHog.captureException).not.toHaveBeenCalled();
  });

  test('keeps exception capture fail-open', () => {
    const debug = vi.spyOn(logger, 'debug');
    vi.stubGlobal('__APP_REVISION__', 'a'.repeat(40));
    postHog.captureException.mockImplementationOnce(() => {
      throw new Error('SDK failure');
    });
    expect(() => {
      captureException(new Error('private-error-sentinel'), null);
    }).not.toThrow();
    expect(debug).toHaveBeenCalledExactlyOnceWith(
      'Failed capturing exception in PostHog',
    );
  });
});
