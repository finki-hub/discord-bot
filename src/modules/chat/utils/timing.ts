import { type Message } from 'discord.js';

import { logger } from '@/common/logger/index.js';
import { labels } from '@/translations/labels.js';

const MAX_MESSAGE_LENGTH = 2_000;

const formatDuration = (ms: number) =>
  ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${Math.round(ms)}ms`;

export const appendTimingFootnote = async (
  message: Message | undefined,
  startedAt: number,
  firstChunkAt: null | number,
) => {
  if (message === undefined) {
    return;
  }

  const total = formatDuration(Date.now() - startedAt);
  const ttft =
    firstChunkAt === null ? null : formatDuration(firstChunkAt - startedAt);
  const footnote =
    ttft === null
      ? `\n-# ⏱ ${total}`
      : `\n-# ⏱ ${total} · ${labels.firstToken} ${ttft}`;

  try {
    // Re-fetch first: the streaming loop edits the answer in place (through the
    // interaction handle on slash commands, or the message reply on continuations),
    // so the cached Message may still hold its first-flush content. Reading
    // message.content here without re-fetching would clobber the finished answer
    // with just its first chunk.
    const current = await message.fetch();

    if (current.content.length + footnote.length > MAX_MESSAGE_LENGTH) {
      return;
    }

    await current.edit({ content: current.content + footnote });
  } catch (error) {
    logger.warn(`Failed appending timing footnote\n${String(error)}`, {
      guildId: message.guildId ?? undefined,
    });
  }
};
