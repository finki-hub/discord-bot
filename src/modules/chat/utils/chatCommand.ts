import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import { safeEphemeralReplyToInteraction } from '@/common/utils/messages.js';
import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { isModelSelectable } from '../schemas/Model.js';
import { resolveInteractionChatUser } from './interaction.js';
import { getSupportedModels, getValidatedInferenceModel } from './requests.js';
import { handlePromptWithStreaming } from './streaming.js';

type CommonCommandOptions = {
  readonly allowReasoning?: boolean;
};

export const getCommonCommand = (
  name: keyof typeof commandDescriptions,
  { allowReasoning = true }: CommonCommandOptions = {},
) => {
  const data = new SlashCommandBuilder()
    .setName(name)
    .setDescription(commandDescriptions[name])
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Промпт за LLM агентот')
        .setRequired(true)
        .setMaxLength(2_000),
    );

  if (allowReasoning) {
    data.addBooleanOption((option) =>
      option
        .setName('reasoning')
        .setDescription(
          'Овозможи размислување пред одговор (ако моделот поддржува)',
        )
        .setRequired(false),
    );
  }

  const execute = async (interaction: ChatInputCommandInteraction) => {
    const prompt = interaction.options.getString('prompt', true);
    const embeddingsModel =
      interaction.options.getString('embeddings-model') ?? undefined;
    const inferenceModel =
      interaction.options.getString('inference-model') ?? undefined;
    const temperature =
      interaction.options.getNumber('temperature') ?? undefined;
    const topP = interaction.options.getNumber('top-p') ?? undefined;
    const maxTokens = interaction.options.getNumber('max-tokens') ?? undefined;
    const reasoning = allowReasoning
      ? (interaction.options.getBoolean('reasoning') ?? undefined)
      : false;

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
        await safeEphemeralReplyToInteraction(
          interaction,
          commandErrors.llmUnavailable,
        );
        return;
      }
      const selectedModel = catalog.models.find(
        ({ id }) => id === inferenceModel,
      );
      if (selectedModel === undefined || !isModelSelectable(selectedModel)) {
        await safeEphemeralReplyToInteraction(
          interaction,
          commandErrors.invalidInferenceModel,
        );
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
  };

  return { data, execute };
};
