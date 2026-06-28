/* eslint-disable camelcase -- PostHog event properties follow its snake_case convention */

import { createHash } from 'node:crypto';
import { PostHog } from 'posthog-node';

import { logger } from '@/common/logger/index.js';
import {
  getPostHogHost,
  getPostHogKey,
  getPostHogSalt,
} from '@/configuration/environment.js';

// Every event carries this so the shared PostHog project can tell fleet services apart.
const SERVICE = 'discord-bot';

// Stable distinct_id for exceptions that arise without a known user (process/client level).
const FALLBACK_DISTINCT_ID = 'discord-bot';

const state: { client: null | PostHog } = { client: null };

export const initAnalytics = () => {
  const key = getPostHogKey();

  if (key === null) {
    logger.debug('PostHog analytics disabled (no POSTHOG_KEY)');

    return;
  }

  state.client = new PostHog(key, {
    // Macedonian prompts/answers are sovereign data: never let PostHog scrape
    // exception stacks that could embed message text.
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

  // Detach before awaiting so a concurrent capture cannot use a draining client.
  state.client = null;
  await client.shutdown();
};

// distinct_id is a salted hash so a raw Discord snowflake never leaves the bot.
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

  // Build a fresh, metadata-only payload; never spread request/options objects.
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

type ExceptionProps = {
  command?: string;
  surface?: string;
};

// Surface errors to PostHog with metadata only; never throws so it is safe in
// catch blocks and process-level handlers.
export const captureException = (
  error: unknown,
  // Raw user id when known (hashed here) or null to use the service fallback.
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
    // Residency: metadata only, never the user question or answer text.
    client.captureException(normalizedError, distinctId, {
      command: props.command ?? null,
      error_type: normalizedError.name,
      service: SERVICE,
      surface: props.surface ?? null,
    });
  } catch (captureError) {
    // Telemetry must never break the error handling it observes.
    logger.debug(
      `Failed capturing exception in PostHog\n${String(captureError)}`,
    );
  }
};
