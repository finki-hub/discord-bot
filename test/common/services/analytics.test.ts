import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  captureException,
  initAnalytics,
  shutdownAnalytics,
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

describe('analytics exception capture', () => {
  beforeEach(() => {
    vi.stubEnv('POSTHOG_KEY', 'test-key');
    vi.stubEnv('POSTHOG_SALT', 'test-salt');
    postHog.capture.mockClear();
    postHog.captureException.mockClear();
    postHog.shutdown.mockClear();
    initAnalytics();
  });

  afterEach(async () => {
    await shutdownAnalytics();
  });

  test('uses SDK exception capture without exposing the original message', () => {
    const error = Object.defineProperty(
      new Error('provider-secret global_limit=100'),
      'name',
      { value: 'ProviderError' },
    );

    captureException(error, 'discord-user', {
      command: 'ask',
      surface: 'interaction',
    });

    expect(postHog.capture).not.toHaveBeenCalled();
    expect(postHog.captureException).toHaveBeenCalledOnce();
    const [capturedError, distinctId, properties] =
      postHog.captureException.mock.calls[0] ?? [];
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError).toMatchObject({
      message: 'Captured exception',
      name: 'ProviderError',
    });
    expect(capturedError?.stack).not.toContain('provider-secret');
    expect(distinctId).toBe(
      createHash('sha256').update('test-saltdiscord-user').digest('hex'),
    );
    expect(properties).toEqual({
      command: 'ask',
      error_type: 'ProviderError',
      service: 'discord-bot',
      surface: 'interaction',
    });
  });
});
