import {
  type ChatInputCommandInteraction,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
} from 'discord.js';

import { commandErrors } from '@/translations/commands.js';

import { ChatApiError, type ChatUser } from '../schemas/Credentials.js';
import { resolveChatUser } from './identity.js';

type ChatInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction;

export const resolveInteractionChatUser = async (
  interaction: ChatInteraction,
): Promise<ChatUser | null> => {
  try {
    return await resolveChatUser(interaction.user);
  } catch (error) {
    if (!(error instanceof ChatApiError)) {
      throw error;
    }

    await (interaction.deferred || interaction.replied
      ? interaction.editReply(commandErrors.llmUnavailable)
      : interaction.reply({
          content: commandErrors.llmUnavailable,
          flags: MessageFlags.Ephemeral,
        }));
    return null;
  }
};
