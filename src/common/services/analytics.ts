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
