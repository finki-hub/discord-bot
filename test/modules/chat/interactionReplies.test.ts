import { MessageFlags } from 'discord.js';
import { describe, expect, test } from 'vitest';

import { safeReplyToInteraction } from '@/common/utils/messages.js';
import { shouldDeferCommand } from '@/core/commands/interactionHandlerUtils.js';

import {
  callsOf,
  fakeInteraction,
  payloadFlags,
} from './interactionFixture.js';

const USER_ID = '00000000-0000-4000-8000-000000000003';
const MENTIONED_ID = '00000000-0000-4000-8000-000000000004';

type AllowedMentions = {
  parse?: string[];
  repliedUser?: boolean;
  users?: string[];
};

const mentionsOf = (payload: unknown): AllowedMentions | undefined =>
  typeof payload === 'object' &&
  payload !== null &&
  'allowedMentions' in payload
    ? (payload.allowedMentions as AllowedMentions)
    : undefined;

const expectEphemeral = (calls: ReturnType<typeof callsOf>): void => {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(payloadFlags(call.payload)).toBe(MessageFlags.Ephemeral);
  }
};

describe('interaction replies', () => {
  test('defers public chat commands but not private model listings', () => {
    expect(shouldDeferCommand('chat models')).toBe(false);
    expect(shouldDeferCommand('chat query')).toBe(true);
  });

  test('defers help and list responses that wait on external data', () => {
    expect(shouldDeferCommand('help')).toBe(true);
    expect(shouldDeferCommand('list links')).toBe(true);
    expect(shouldDeferCommand('list questions')).toBe(true);
  });

  test('leaves pagination buttons un-deferred so they update in place', () => {
    expect(shouldDeferCommand('listLinks')).toBe(false);
    expect(shouldDeferCommand('listQuestions')).toBe(false);
  });

  test('blocks role and everyone mentions in replies by default', async () => {
    const driver = fakeInteraction('chat', 'query', USER_ID);

    await safeReplyToInteraction(
      driver.interaction,
      '@everyone <@&123456789012345678>',
    );

    for (const call of driver.state.calls) {
      expect(mentionsOf(call.payload)).toEqual({
        parse: [],
        repliedUser: false,
      });
    }
  });

  test('allows only explicitly named users', async () => {
    const driver = fakeInteraction('chat', 'query', USER_ID);

    await safeReplyToInteraction(driver.interaction, `<@${MENTIONED_ID}>`, {
      mentionUserIds: [MENTIONED_ID],
    });

    expect(mentionsOf(callsOf(driver.state, 'reply')[0]?.payload)).toEqual({
      parse: [],
      repliedUser: false,
      users: [MENTIONED_ID],
    });
  });

  test('preserves privacy across split private replies', async () => {
    const driver = fakeInteraction('chat', 'models', USER_ID);

    await safeReplyToInteraction(driver.interaction, 'private '.repeat(1_000), {
      ephemeral: true,
    });

    expectEphemeral(driver.state.calls);
    expect(callsOf(driver.state, 'followUp').length).toBeGreaterThan(0);
  });

  test('keeps split public replies public', async () => {
    const driver = fakeInteraction('chat', 'query', USER_ID);

    await safeReplyToInteraction(driver.interaction, 'public '.repeat(1_000));

    expect(callsOf(driver.state, 'reply')).toHaveLength(1);
    expect(callsOf(driver.state, 'followUp').length).toBeGreaterThan(0);
    for (const call of driver.state.calls) {
      expect(payloadFlags(call.payload)).toBeUndefined();
    }
  });
});
