import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
} from 'discord.js';

import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { SendPromptOptionsSchema } from '@/modules/chat/schemas/Chat.js';
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

  const options = SendPromptOptionsSchema.parse({
    embeddingsModel: models.embeddings,
    inferenceModel: models.inference,
    prompt,
  });

  await handlePromptWithStreaming(
    interaction,
    options,
    'Prompt context command',
  );
};
