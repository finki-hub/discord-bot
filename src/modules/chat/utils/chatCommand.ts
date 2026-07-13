import {
  type ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { ChatApiError } from '../schemas/Credentials.js';
import { resolveChatUser } from './identity.js';
import { getValidatedInferenceModel } from './requests.js';
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
    const validatedInferenceModel = await getValidatedInferenceModel(
      chatUser.id,
      inferenceModel ?? models.inference,
    );

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
