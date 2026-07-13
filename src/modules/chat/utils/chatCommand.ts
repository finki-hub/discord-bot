import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { resolveInteractionChatUser } from './interaction.js';
import { getSupportedModels, getValidatedInferenceModel } from './requests.js';
import { handlePromptWithStreaming } from './streaming.js';

export const getCommonCommand = (name: keyof typeof commandDescriptions) => ({
  data: new SlashCommandBuilder()
    .setName(name)
    .setDescription(commandDescriptions[name])
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Промпт за LLM агентот')
        .setRequired(true)
        .setMaxLength(2_000),
    )
    .addBooleanOption((option) =>
      option
        .setName('reasoning')
        .setDescription(
          'Овозможи размислување пред одговор (ако моделот поддржува)',
        )
        .setRequired(false),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const prompt = interaction.options.getString('prompt', true);
    const embeddingsModel =
      interaction.options.getString('embeddings-model') ?? undefined;
    const inferenceModel =
      interaction.options.getString('inference-model') ?? undefined;
    const temperature =
      interaction.options.getNumber('temperature') ?? undefined;
    const topP = interaction.options.getNumber('top-p') ?? undefined;
    const maxTokens = interaction.options.getNumber('max-tokens') ?? undefined;
    const reasoning = interaction.options.getBoolean('reasoning') ?? undefined;

    const models =
      interaction.guild === null
        ? DEFAULT_CONFIGURATION.models
        : await getConfigProperty('models', interaction.guild.id);

    const chatUser = await resolveInteractionChatUser(interaction);
    if (chatUser === null) {
      return;
    }

    let validatedInferenceModel: string | undefined;
    if (inferenceModel === undefined) {
      validatedInferenceModel = await getValidatedInferenceModel(
        chatUser.id,
        models.inference,
      );
    } else {
      const catalog = await getSupportedModels(chatUser.id);
      if (catalog === null) {
        await interaction.editReply(commandErrors.llmUnavailable);
        return;
      }
      if (catalog.models.every(({ id }) => id !== inferenceModel)) {
        await interaction.editReply(commandErrors.invalidInferenceModel);
        return;
      }
      validatedInferenceModel = inferenceModel;
    }

    const options = SendPromptOptionsSchema.parse({
      embeddingsModel: embeddingsModel ?? models.embeddings,
      inferenceModel: validatedInferenceModel,
      maxTokens,
      prompt,
      reasoning,
      temperature,
      topP,
      userId: chatUser.id,
    });

    await handlePromptWithStreaming(interaction, options, 'chat query command');
  },
});
