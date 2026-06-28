/* eslint-disable camelcase -- PostHog event properties follow its snake_case convention */

import { createHash } from 'node:crypto';
import { PostHog } from 'posthog-node';

import { logger } from '@/common/logger/index.js';
import {
  getPostHogHost,
  getPostHogKey,
  getPostHogSalt,
} from '@/configuration/environment.js';

const SERVICE = 'discord-bot';

const FALLBACK_DISTINCT_ID = 'discord-bot';

const state: { client: null | PostHog } = { client: null };

export const initAnalytics = () => {
  const key = getPostHogKey();

  if (key === null) {
    logger.debug('PostHog analytics disabled (no POSTHOG_KEY)');

    return;
  }

  if (getPostHogSalt() === '') {
    logger.warn(
      'PostHog analytics disabled: set POSTHOG_SALT to a non-empty value to enable analytics with privacy-safe hashed user IDs.',
    );

    return;
  }

  state.client = new PostHog(key, {
    enableExceptionAutocapture: true,
    host: getPostHogHost(),
  });

  logger.debug('PostHog analytics initialized');
};

export const shutdownAnalytics = async () => {
  const { client } = state;

  if (client === null) {
    return;
  }

  state.client = null;
  await client.shutdown();
};

const hashUserId = (userId: string): string =>
  createHash('sha256')
    .update(getPostHogSalt() + userId)
    .digest('hex');

type ChatEventProps = {
  channelId: null | string;
  command: string;
  guildId: null | string;
  surface: string;
};

export const trackCommandInvoked = (
  userId: string,
  props: ChatEventProps,
): void => {
  const { client } = state;

  if (client === null) {
    return;
  }

  client.capture({
    distinctId: hashUserId(userId),
    event: 'command_invoked',
    properties: {
      channel_id: props.channelId,
      command: props.command,
      guild_id: props.guildId,
      service: SERVICE,
      surface: props.surface,
    },
  });
};

export const trackMessageAnswered = (
  userId: string,
  props: ChatEventProps & { responseId: null | string },
): void => {
  const { client } = state;

  if (client === null) {
    return;
  }

  client.capture({
    distinctId: hashUserId(userId),
    event: 'message_answered',
    properties: {
      channel_id: props.channelId,
      command: props.command,
      guild_id: props.guildId,
      response_id: props.responseId,
      service: SERVICE,
      surface: props.surface,
    },
  });
};

type InteractionEventProps = {
  command: string;
  durationMs: number;
  errorType?: string | undefined;
  module?: string | undefined;
  outcome: 'error' | 'ok';
  surface: 'dm' | 'guild';
  type: 'autocomplete' | 'button' | 'chat' | 'context' | 'modal';
};

export const trackInteraction = (
  userId: string,
  props: InteractionEventProps,
): void => {
  const { client } = state;

  if (client === null) {
    return;
  }

  client.capture({
    distinctId: hashUserId(userId),
    event: 'interaction',
    properties: {
      command: props.command,
      duration_ms: props.durationMs,
      ...(props.errorType !== undefined && { error_type: props.errorType }),
      ...(props.module !== undefined && { module: props.module }),
      outcome: props.outcome,
      service: SERVICE,
      surface: props.surface,
      type: props.type,
    },
  });
};

type LifecycleEventProps = {
  guildCount?: number;
  guildId?: string;
  memberCount?: number;
};

export const trackLifecycle = (
  event: string,
  props: LifecycleEventProps = {},
): void => {
  const { client } = state;

  if (client === null) {
    return;
  }

  client.capture({
    distinctId: FALLBACK_DISTINCT_ID,
    event,
    properties: {
      ...(props.guildCount !== undefined && { guild_count: props.guildCount }),
      ...(props.guildId !== undefined && { guild_id: props.guildId }),
      ...(props.memberCount !== undefined && {
        member_count: props.memberCount,
      }),
      service: SERVICE,
    },
  });
};

type ExceptionProps = {
  command?: string;
  surface?: string;
};

export const captureException = (
  error: unknown,
  userId: null | string,
  props: ExceptionProps = {},
): void => {
  const { client } = state;

  if (client === null) {
    return;
  }

  const distinctId =
    userId === null ? FALLBACK_DISTINCT_ID : hashUserId(userId);
  const normalizedError = Error.isError(error)
    ? error
    : new Error(String(error));

  try {
    client.captureException(normalizedError, distinctId, {
      command: props.command ?? null,
      error_type: normalizedError.name,
      service: SERVICE,
      surface: props.surface ?? null,
    });
  } catch (captureError) {
    logger.debug(
      `Failed capturing exception in PostHog\n${String(captureError)}`,
    );
  }
};
