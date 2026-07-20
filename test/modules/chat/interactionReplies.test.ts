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

const expectEphemeral = (calls: ReturnType<typeof callsOf>): void => {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(payloadFlags(call.payload)).toBe(MessageFlags.Ephemeral);
  }
};

describe('interaction replies', () => {
  test('defers public chat commands but not private model listings', () => {
    expect(shouldDeferCommand('chat models')).toBe(false);
    expect(shouldDeferCommand('chat closest')).toBe(true);
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
    const driver = fakeInteraction('chat', 'closest', USER_ID);

    await safeReplyToInteraction(driver.interaction, 'public '.repeat(1_000));

    expect(callsOf(driver.state, 'reply')).toHaveLength(1);
    expect(callsOf(driver.state, 'followUp').length).toBeGreaterThan(0);
    for (const call of driver.state.calls) {
      expect(payloadFlags(call.payload)).toBeUndefined();
    }
  });
});
