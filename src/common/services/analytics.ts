/* eslint-disable camelcase -- PostHog event properties follow its snake_case convention */

import { createHash } from 'node:crypto';
import { PostHog } from 'posthog-node';

import { logger } from '@/common/logger/index.js';
import { errorCategory } from '@/common/utils/safeError.js';
import {
  getPostHogHost,
  getPostHogKey,
  getPostHogSalt,
} from '@/configuration/environment.js';

const SERVICE = 'discord-bot';

declare const __APP_REVISION__: string | undefined;

const REVISION_PATTERN = /^[a-f0-9]{40}$/u;

const getRevisionProperties = (): { app_revision?: string } =>
  typeof __APP_REVISION__ === 'string' &&
  REVISION_PATTERN.test(__APP_REVISION__)
    ? { app_revision: __APP_REVISION__ }
    : {};

const FALLBACK_DISTINCT_ID = 'discord-bot';

const state: { client: null | PostHog } = { client: null };

const sanitizeExceptionForCapture = (category: string): Error => {
  const safeError = new Error(category);
  // A nonempty header with zero frames prevents SDK capture-site stack synthesis
  // and source-context enrichment. Deleting the stack is not sufficient.
  // eslint-disable-next-line unicorn/no-error-property-assignment -- Deliberately replace every frame with a fixed categorical header.
  safeError.stack = `Error: ${category}`;
  return safeError;
};

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
    enableExceptionAutocapture: false,
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
      ...getRevisionProperties(),
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
      ...getRevisionProperties(),
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
      ...getRevisionProperties(),
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
      ...getRevisionProperties(),
    },
  });
};

type ExceptionProps = {
  command?: string;
  phase?: string;
  surface?: string;
};

// Exact labels from the two streaming callers and conversation continuation.
const EXCEPTION_COMMANDS = new Set([
  'chat conversation continuation',
  'chat query command',
  'Prompt context command',
]);
const EXCEPTION_SURFACES = new Set(['interaction', 'reply', 'thread']);
const EXCEPTION_PHASES = new Set(['uncaught_exception', 'unhandled_rejection']);

const allowedLabel = (value: string | undefined, allowed: Set<string>) => {
  if (value === undefined) return null;
  return allowed.has(value) ? value : 'unknown';
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

  try {
    const distinctId =
      userId === null ? FALLBACK_DISTINCT_ID : hashUserId(userId);
    const category = errorCategory(error);
    const capturedError = sanitizeExceptionForCapture(category);
    client.captureException(capturedError, distinctId, {
      $process_person_profile: false,
      command: allowedLabel(props.command, EXCEPTION_COMMANDS),
      error_type: category,
      phase: allowedLabel(props.phase, EXCEPTION_PHASES),
      service: SERVICE,
      surface: allowedLabel(props.surface, EXCEPTION_SURFACES),
      ...getRevisionProperties(),
    });
  } catch {
    logger.debug('Failed capturing exception in PostHog');
  }
};
