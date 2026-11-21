import {
  type AnyThreadChannel,
  Collection,
  type Message,
  MessageFlags,
} from 'discord.js';
import { describe, expect, test, vi } from 'vitest';

import {
  MAX_TICKET_INACTIVITY_MILLISECONDS,
  TICKET_REMINDER_FOOTER,
} from '@/modules/ticket/utils/constants.js';
import {
  buildTicketReminder,
  getDueReminderStage,
  getInactivityAction,
  getInactivityContext,
  getReminderDetails,
  isTicketReminder,
  sendTicketReminder,
} from '@/modules/ticket/utils/inactivity.js';
import { ticketMessages } from '@/translations/tickets.js';

const DAY = 86_400_000;
const BASELINE = Temporal.Instant.from(
  '2026-01-01T00:00:00Z',
).epochMilliseconds;

const userMessage = (
  createdTimestamp = BASELINE,
  id = 'user-message',
): Message =>
  ({
    author: { bot: false },
    createdTimestamp,
    embeds: [],
    id,
  }) as unknown as Message;

const reminderMessage = (stage: '1d' | '3d'): Message =>
  ({
    author: { bot: true },
    embeds: [
      {
        footer: {
          text: `${TICKET_REMINDER_FOOTER} · ${stage} · ${ticketMessages.ticketReminderLastActivity}`,
        },
        timestamp: Temporal.Instant.fromEpochMilliseconds(BASELINE).toString(),
      },
    ],
    id: 'reminder',
  }) as unknown as Message;

const malformedReminder = (): Message =>
  ({
    author: { bot: true },
    embeds: [
      {
        footer: {
          text: `${TICKET_REMINDER_FOOTER} · 3d · ${ticketMessages.ticketReminderLastActivity}`,
        },
        timestamp: null,
      },
    ],
    id: 'malformed-reminder',
  }) as unknown as Message;

const threadFor = ({
  createdTimestamp = BASELINE,
  fetched = [],
  lastMessage = null,
  previous = [],
}: {
  createdTimestamp?: null | number;
  fetched?: Message[];
  lastMessage?: Message | null;
  previous?: Message[];
}) => {
  const fetch = vi.fn<
    (options?: { before?: string }) => Promise<Collection<string, Message>>
  >(async (options) => {
    const messages = options?.before === undefined ? fetched : previous;

    return new Collection(messages.map((message) => [message.id, message]));
  });

  return {
    createdTimestamp,
    lastMessage,
    messages: { fetch },
  } as unknown as AnyThreadChannel;
};

const actionFor = (
  elapsed: number,
  lastReminderStage: '1d' | '3d' | null = null,
) =>
  getInactivityAction({
    lastActivity: BASELINE,
    lastReminderStage,
    now: BASELINE + elapsed,
  });

describe('getDueReminderStage', () => {
  test('uses the 3-day and 1-day thresholds', () => {
    expect(getDueReminderStage(7 * DAY - 1)).toBeNull();
    expect(getDueReminderStage(7 * DAY)).toBe('3d');
    expect(getDueReminderStage(8 * DAY)).toBe('3d');
    expect(getDueReminderStage(9 * DAY - 1)).toBe('3d');
    expect(getDueReminderStage(9 * DAY)).toBe('1d');
  });
});

describe('getInactivityAction', () => {
  test('does nothing before seven idle days', () => {
    expect(actionFor(6 * DAY)).toEqual({ type: 'none' });
  });

  test('sends the 3-day reminder at seven idle days', () => {
    expect(actionFor(7 * DAY)).toEqual({ stage: '3d', type: 'remind' });
  });

  test('does not repeat the 3-day reminder', () => {
    expect(actionFor(8 * DAY, '3d')).toEqual({ type: 'none' });
  });

  test('sends the 1-day reminder after a 3-day reminder', () => {
    expect(actionFor(9 * DAY, '3d')).toEqual({ stage: '1d', type: 'remind' });
  });

  test('does not repeat the 1-day reminder', () => {
    expect(actionFor(9 * DAY, '1d')).toEqual({ type: 'none' });
  });

  test('closes after ten idle days even when a reminder was sent', () => {
    expect(actionFor(MAX_TICKET_INACTIVITY_MILLISECONDS, '1d')).toEqual({
      type: 'close',
    });
    expect(actionFor(MAX_TICKET_INACTIVITY_MILLISECONDS)).toEqual({
      type: 'close',
    });
  });
});

describe('reminder message details', () => {
  test('ignores human messages and bot messages without the marker', () => {
    expect(getReminderDetails(userMessage())).toBeNull();
    expect(
      getReminderDetails({
        author: { bot: true },
        embeds: [{ footer: { text: 'Some other footer' } }],
      } as unknown as Message),
    ).toBeNull();
  });

  test('reads the stage and last activity from a reminder', () => {
    expect(getReminderDetails(reminderMessage('3d'))).toEqual({
      baseline: BASELINE,
      stage: '3d',
    });
    expect(getReminderDetails(reminderMessage('1d'))).toEqual({
      baseline: BASELINE,
      stage: '1d',
    });
  });

  test('recognizes malformed reminders so they are not treated as activity', () => {
    expect(getReminderDetails(malformedReminder())).toBeNull();
    expect(isTicketReminder(malformedReminder())).toBe(true);
    expect(isTicketReminder(userMessage())).toBe(false);
  });
});

describe('getInactivityContext', () => {
  test('uses a normal last message as activity', async () => {
    const thread = threadFor({ lastMessage: userMessage(BASELINE + DAY) });

    await expect(getInactivityContext(thread)).resolves.toEqual({
      lastActivity: BASELINE + DAY,
      lastReminderStage: null,
    });
  });

  test('uses the reminder baseline instead of the reminder timestamp', async () => {
    const thread = threadFor({ lastMessage: reminderMessage('3d') });

    await expect(getInactivityContext(thread)).resolves.toEqual({
      lastActivity: BASELINE,
      lastReminderStage: '3d',
    });
  });

  test('fetches the latest message when the cache is empty', async () => {
    const thread = threadFor({
      fetched: [userMessage(BASELINE + 2 * DAY)],
    });

    await expect(getInactivityContext(thread)).resolves.toEqual({
      lastActivity: BASELINE + 2 * DAY,
      lastReminderStage: null,
    });
  });

  test('falls back to the thread creation time when there are no messages', async () => {
    const thread = threadFor({ fetched: [] });

    await expect(getInactivityContext(thread)).resolves.toEqual({
      lastActivity: BASELINE,
      lastReminderStage: null,
    });
  });

  test('scans previous messages for a malformed reminder', async () => {
    const thread = threadFor({
      lastMessage: malformedReminder(),
      previous: [userMessage(BASELINE + 3 * DAY, 'previous-user')],
    });

    await expect(getInactivityContext(thread)).resolves.toEqual({
      lastActivity: BASELINE + 3 * DAY,
      lastReminderStage: null,
    });
  });

  test('returns null when there is no activity or creation time', async () => {
    const thread = threadFor({
      createdTimestamp: null,
      fetched: [],
    });

    await expect(getInactivityContext(thread)).resolves.toBeNull();
  });
});

describe('buildTicketReminder', () => {
  test('builds the 3-day warning with a stateless baseline marker', () => {
    const embed = buildTicketReminder(BASELINE, '3d').toJSON();

    expect(embed.description).toContain('3 дена');
    expect(embed.footer?.text).toBe(
      `${TICKET_REMINDER_FOOTER} · 3d · ${ticketMessages.ticketReminderLastActivity}`,
    );
    expect(embed.timestamp).not.toBeNull();
    expect(Temporal.Instant.from(embed.timestamp ?? '').epochMilliseconds).toBe(
      BASELINE,
    );
  });

  test('builds the 1-day warning', () => {
    const embed = buildTicketReminder(BASELINE, '1d').toJSON();

    expect(embed.description).toContain('1 ден');
  });
});

test('sends reminders without notifications', async () => {
  const send = vi.fn<(...args: unknown[]) => Promise<unknown>>(
    async () => ({}),
  );
  const thread = { id: 'thread', send } as unknown as AnyThreadChannel;

  await sendTicketReminder(thread, {
    guildId: 'guild',
    lastActivity: BASELINE,
    stage: '1d',
  });

  expect(send).toHaveBeenCalledExactlyOnceWith({
    embeds: [expect.anything()],
    flags: MessageFlags.SuppressNotifications,
  });
});
