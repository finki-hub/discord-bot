import {
  type AnyThreadChannel,
  EmbedBuilder,
  type Message,
  MessageFlags,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import {
  ticketMessageFunctions,
  ticketMessages,
} from '@/translations/tickets.js';

import {
  MAX_TICKET_INACTIVITY_MILLISECONDS,
  TICKET_REMINDER_FOOTER,
  TICKET_REMINDER_ONE_DAY_MILLISECONDS,
  TICKET_REMINDER_THREE_DAYS_MILLISECONDS,
} from './constants.js';

export type TicketInactivityAction =
  | { stage: TicketReminderStage; type: 'remind' }
  | { type: 'close' }
  | { type: 'none' };

export type TicketInactivityContext = {
  lastActivity: number;
  lastReminderStage: null | TicketReminderStage;
};

export type TicketReminderDetails = {
  baseline: number;
  stage: TicketReminderStage;
};

export type TicketReminderStage = '1d' | '3d';

const TICKET_REMINDER_STAGE_RANK: Record<TicketReminderStage, number> = {
  '1d': 2,
  '3d': 1,
};

export const getDueReminderStage = (
  elapsedMilliseconds: number,
): null | TicketReminderStage => {
  if (
    elapsedMilliseconds >=
    MAX_TICKET_INACTIVITY_MILLISECONDS - TICKET_REMINDER_ONE_DAY_MILLISECONDS
  ) {
    return '1d';
  }

  if (
    elapsedMilliseconds >=
    MAX_TICKET_INACTIVITY_MILLISECONDS - TICKET_REMINDER_THREE_DAYS_MILLISECONDS
  ) {
    return '3d';
  }

  return null;
};

export const getInactivityAction = ({
  lastActivity,
  lastReminderStage,
  now,
}: {
  lastActivity: number;
  lastReminderStage: null | TicketReminderStage;
  now: number;
}): TicketInactivityAction => {
  const elapsed = now - lastActivity;

  if (elapsed >= MAX_TICKET_INACTIVITY_MILLISECONDS) {
    return { type: 'close' };
  }

  const dueStage = getDueReminderStage(elapsed);

  if (dueStage === null) {
    return { type: 'none' };
  }

  if (
    lastReminderStage !== null &&
    TICKET_REMINDER_STAGE_RANK[lastReminderStage] >=
      TICKET_REMINDER_STAGE_RANK[dueStage]
  ) {
    return { type: 'none' };
  }

  return { stage: dueStage, type: 'remind' };
};

export const isTicketReminder = (
  message: Pick<Message, 'author' | 'embeds'>,
): boolean =>
  message.author.bot &&
  message.embeds.some((embed) =>
    embed.footer?.text.startsWith(TICKET_REMINDER_FOOTER),
  );

export const getReminderDetails = (
  message: Pick<Message, 'author' | 'embeds'>,
): null | TicketReminderDetails => {
  if (!message.author.bot) {
    return null;
  }

  for (const embed of message.embeds) {
    const footer = embed.footer?.text;

    if (footer === undefined) {
      continue;
    }

    const [prefix, stage] = footer.split(' · ', 2);

    if (prefix !== TICKET_REMINDER_FOOTER) {
      continue;
    }

    if (stage !== '1d' && stage !== '3d') {
      continue;
    }

    if (embed.timestamp === null) {
      continue;
    }

    let baseline: number;

    try {
      baseline = Temporal.Instant.from(embed.timestamp).epochMilliseconds;
    } catch {
      continue;
    }

    return { baseline, stage };
  }

  return null;
};

export const getInactivityContext = async (
  thread: AnyThreadChannel,
): Promise<null | TicketInactivityContext> => {
  let latestMessage = thread.lastMessage;

  if (latestMessage === null) {
    const latestMessages = await thread.messages.fetch({ limit: 1 });
    latestMessage = latestMessages.first() ?? null;
  }

  if (latestMessage === null) {
    return thread.createdTimestamp === null
      ? null
      : { lastActivity: thread.createdTimestamp, lastReminderStage: null };
  }

  const details = getReminderDetails(latestMessage);

  if (details !== null) {
    return {
      lastActivity: details.baseline,
      lastReminderStage: details.stage,
    };
  }

  if (!isTicketReminder(latestMessage)) {
    return {
      lastActivity: latestMessage.createdTimestamp,
      lastReminderStage: null,
    };
  }

  const previousMessages = await thread.messages.fetch({
    before: latestMessage.id,
    limit: 10,
  });
  const previous = previousMessages
    .values()
    .toArray()
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  for (const message of previous) {
    const previousDetails = getReminderDetails(message);

    if (previousDetails !== null) {
      return {
        lastActivity: previousDetails.baseline,
        lastReminderStage: previousDetails.stage,
      };
    }

    if (!isTicketReminder(message)) {
      return {
        lastActivity: message.createdTimestamp,
        lastReminderStage: null,
      };
    }
  }

  return thread.createdTimestamp === null
    ? null
    : { lastActivity: thread.createdTimestamp, lastReminderStage: null };
};

export const buildTicketReminder = (
  lastActivity: number,
  stage: TicketReminderStage,
) =>
  new EmbedBuilder()
    .setDescription(
      ticketMessageFunctions.ticketInactivityWarning(stage === '1d' ? 1 : 3),
    )
    .setFooter({
      text: `${TICKET_REMINDER_FOOTER} · ${stage} · ${ticketMessages.ticketReminderLastActivity}`,
    })
    .setTimestamp(lastActivity);

export const sendTicketReminder = async (
  thread: AnyThreadChannel,
  {
    guildId,
    lastActivity,
    stage,
  }: {
    guildId: string;
    lastActivity: number;
    stage: TicketReminderStage;
  },
): Promise<void> => {
  try {
    await thread.send({
      embeds: [buildTicketReminder(lastActivity, stage)],
      flags: MessageFlags.SuppressNotifications,
    });
  } catch (error: unknown) {
    logger.error(
      `Failed sending inactivity reminder for ticket ${thread.id}\n${String(error)}`,
      { guildId },
    );
  }
};
