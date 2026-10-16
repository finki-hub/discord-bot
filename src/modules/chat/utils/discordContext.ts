import { type BaseInteraction, type Message } from 'discord.js';

import type { DiscordContext } from '../schemas/Chat.js';

// Stored with the conversation so an answer can be traced back to Discord.

export const interactionDiscordContext = (
  interaction: BaseInteraction,
): DiscordContext => ({
  channelId: interaction.channelId ?? undefined,
  guildId: interaction.guildId ?? undefined,
  // Slash commands have an interaction ID, not a source message ID.
  messageId: interaction.isMessageContextMenuCommand()
    ? interaction.targetId
    : undefined,
});

export const messageDiscordContext = (message: Message): DiscordContext => ({
  channelId: message.channelId,
  guildId: message.guildId ?? undefined,
  messageId: message.id,
});
