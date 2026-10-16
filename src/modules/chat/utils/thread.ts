import {
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
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
import { beginChatOperation } from './privacy.js';

const userThreads = new Map<string, string>();

const threadKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

// Register an empty entry only if missing, so an evicted thread is revived
// without wiping the history of a thread that is still live.
const armThread = (threadId: string, userId: string) => {
  if (getConversationHistory(threadId) === undefined) {
    registerConversation([threadId], [], { userId });
  }
};

const fetchExistingThread = async (guild: Guild, threadId: string) => {
  try {
    return await guild.channels.fetch(threadId);
  } catch {
    return null;
  }
};

const createChatThread = async (interaction: ChatInputCommandInteraction) => {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { channel, guild, user } = interaction;

  if (guild === null || channel?.type !== ChannelType.GuildText) {
    await interaction.editReply(commandErrors.chatThreadInvalidChannel);

    return;
  }

  const key = threadKey(guild.id, user.id);
  const existingId = userThreads.get(key);

  if (existingId !== undefined) {
    const existing = await fetchExistingThread(guild, existingId);

    if (existing !== null && existing.isThread() && !existing.locked) {
      if (existing.archived) {
        try {
          await existing.setArchived(false);
        } catch {
          // Unarchiving the thread is best-effort; ignore failures.
        }
      }

      armThread(existing.id, user.id);
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

    armThread(thread.id, user.id);
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

export const handleChatThread = async (
  interaction: ChatInputCommandInteraction,
) => {
  const finish = beginChatOperation(interaction.user.id);
  if (finish === null) {
    await interaction.reply({
      content: commandErrors.llmUnavailable,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  try {
    await createChatThread(interaction);
  } finally {
    finish();
  }
};
