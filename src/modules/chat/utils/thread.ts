import {
  ChannelType,
  type ChatInputCommandInteraction,
  MessageFlags,
  ThreadAutoArchiveDuration,
} from 'discord.js';

import { logger } from '@/common/logger/index.js';
import {
  commandErrors,
  commandResponseFunctions,
  commandResponses,
} from '@/translations/commands.js';

import {
  getConversationHistory,
  registerConversation,
} from './conversation.js';

const userThreads = new Map<string, string>();

const threadKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

// Register an empty entry only if missing, so an evicted thread is revived
// without wiping the history of a thread that is still live.
const armThread = (threadId: string) => {
  if (getConversationHistory(threadId) === undefined) {
    registerConversation([threadId], []);
  }
};

export const handleChatThread = async (
  interaction: ChatInputCommandInteraction,
) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { channel, guild, user } = interaction;

  if (guild === null || channel?.type !== ChannelType.GuildText) {
    await interaction.editReply(commandErrors.chatThreadInvalidChannel);

    return;
  }

  const key = threadKey(guild.id, user.id);
  const existingId = userThreads.get(key);

  if (existingId !== undefined) {
    const existing = await guild.channels.fetch(existingId).catch(() => null);

    if (existing !== null && existing.isThread() && !existing.locked) {
      if (existing.archived) {
        await existing.setArchived(false).catch(() => {});
      }

      armThread(existing.id);
      await interaction.editReply(
        commandResponseFunctions.chatThreadExisting(existing.id),
      );

      return;
    }

    userThreads.delete(key);
  }

  try {
    const thread = await channel.threads.create({
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      invitable: false,
      name: `Разговор — ${user.displayName}`,
      type: ChannelType.PrivateThread,
    });

    await thread.members.add(user.id);
    await thread.send(commandResponses.chatThreadWelcome);

    armThread(thread.id);
    userThreads.set(key, thread.id);

    await interaction.editReply(
      commandResponseFunctions.chatThreadCreated(thread.id),
    );
  } catch (error) {
    logger.error(`Failed creating chat thread\n${String(error)}`, {
      guildId: guild.id,
    });
    await interaction.editReply(commandErrors.chatThreadCreationFailed);
  }
};
