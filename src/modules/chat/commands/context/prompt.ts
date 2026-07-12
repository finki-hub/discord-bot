import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
} from 'discord.js';

import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { SendPromptOptionsSchema } from '@/modules/chat/schemas/Chat.js';
import { ChatApiError } from '@/modules/chat/schemas/Credentials.js';
import { resolveChatUser } from '@/modules/chat/utils/identity.js';
import { getValidatedInferenceModel } from '@/modules/chat/utils/requests.js';
import { handlePromptWithStreaming } from '@/modules/chat/utils/streaming.js';
import { commandErrors } from '@/translations/commands.js';

export const name = 'Prompt';

export const data = new ContextMenuCommandBuilder()
  .setName(name)
  .setType(ApplicationCommandType.Message);

export const execute = async (
  interaction: MessageContextMenuCommandInteraction,
) => {
  const prompt = interaction.targetMessage.content;

  if (prompt.length === 0) {
    await interaction.reply({
      content: commandErrors.unknownChatError,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const models =
    interaction.guild === null
      ? DEFAULT_CONFIGURATION.models
      : await getConfigProperty('models', interaction.guild.id);

  let chatUser;
  try {
    chatUser = await resolveChatUser(interaction.user);
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
    return;
  }
  const inferenceModel = await getValidatedInferenceModel(
    chatUser.id,
    models.inference,
  );

  const options = SendPromptOptionsSchema.parse({
    embeddingsModel: models.embeddings,
    inferenceModel,
    prompt,
    userId: chatUser.id,
  });

  await handlePromptWithStreaming(
    interaction,
    options,
    'Prompt context command',
  );
};
