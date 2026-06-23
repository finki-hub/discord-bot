import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { getFeedbackProperty } from '@/configuration/bot/index.js';
import { labels } from '@/translations/labels.js';

const FEEDBACK_BUTTON_ID = 'chatFeedback';
const MAX_TRACKED_RESPONSES = 1_000;

// Best-effort enrichment cache: a miss never blocks recording feedback, because
// acceptance and ownership ride the customId, not this map.
type FeedbackContext = {
  answer: string;
  question?: string | undefined;
  updatedAt: number;
};

const contexts = new Map<string, FeedbackContext>();

const evictOldest = () => {
  while (contexts.size > MAX_TRACKED_RESPONSES) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;

    for (const [key, value] of contexts) {
      if (value.updatedAt < oldestAt) {
        oldestAt = value.updatedAt;
        oldestKey = key;
      }
    }

    if (oldestKey === undefined) {
      break;
    }

    contexts.delete(oldestKey);
  }
};

export const rememberFeedbackContext = (
  responseId: string,
  context: Omit<FeedbackContext, 'updatedAt'>,
) => {
  contexts.set(responseId, { ...context, updatedAt: Date.now() });
  evictOldest();
};

export const getFeedbackContext = (responseId: string) =>
  contexts.get(responseId);

export const isFeedbackEnabled = async (
  guildId: null | string,
): Promise<boolean> => {
  if (guildId === null) {
    return true;
  }

  return getFeedbackProperty('enabled', guildId);
};

type FeedbackType = 'dislike' | 'like';

export const buildFeedbackRow = (
  responseId: string,
  askerId: string,
  selected?: FeedbackType,
) => {
  const likeStyle =
    selected === 'like' ? ButtonStyle.Success : ButtonStyle.Secondary;
  const dislikeStyle =
    selected === 'dislike' ? ButtonStyle.Danger : ButtonStyle.Secondary;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${FEEDBACK_BUTTON_ID}:like:${responseId}:${askerId}`)
      .setEmoji('👍')
      .setLabel(labels.like)
      .setStyle(likeStyle),
    new ButtonBuilder()
      .setCustomId(`${FEEDBACK_BUTTON_ID}:dislike:${responseId}:${askerId}`)
      .setEmoji('👎')
      .setLabel(labels.dislike)
      .setStyle(dislikeStyle),
  );
};

// The customId carries the response id and asker id, so the click handler is
// restart-safe and works on both surfaces (interactionMetadata is null on
// thread/message-sourced buttons).
export const attachFeedbackButtons = async ({
  askerId,
  guildId,
  message,
  responseId,
}: {
  askerId: string;
  guildId: null | string;
  message: Message | undefined;
  responseId: null | string;
}) => {
  if (message === undefined || responseId === null) {
    return;
  }

  if (!(await isFeedbackEnabled(guildId))) {
    return;
  }

  try {
    await message.edit({ components: [buildFeedbackRow(responseId, askerId)] });
  } catch (error) {
    logger.warn(`Failed attaching feedback buttons\n${String(error)}`, {
      guildId: guildId ?? undefined,
    });
  }
};
