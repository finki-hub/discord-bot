import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

import { DEFAULT_CONFIGURATION } from '@/configuration/bot/defaults.js';
import { getConfigProperty } from '@/configuration/bot/index.js';
import { commandDescriptions } from '@/translations/commands.js';

import { SendPromptOptionsSchema } from '../schemas/Chat.js';
import { handlePromptWithStreaming } from './streaming.js';

export const getCommonCommand = (name: keyof typeof commandDescriptions) => ({
  data: new SlashCommandBuilder()
    .setName(name)
    .setDescription(commandDescriptions[name])
    .addStringOption((option) =>
      option
        .setName('prompt')
        .setDescription('Промпт за LLM агентот')
        .setRequired(true),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const prompt = interaction.options.getString('prompt', true);
    const systemPrompt =
      interaction.options.getString('system-prompt') ?? undefined;
    const embeddingsModel =
      interaction.options.getString('embeddings-model') ?? undefined;
    const inferenceModel =
      interaction.options.getString('inference-model') ?? undefined;
    const temperature =
      interaction.options.getNumber('temperature') ?? undefined;
    const topP = interaction.options.getNumber('top-p') ?? undefined;
    const maxTokens = interaction.options.getNumber('max-tokens') ?? undefined;

    const models =
      interaction.guild === null
        ? DEFAULT_CONFIGURATION.models
        : await getConfigProperty('models', interaction.guild.id);

    const options = SendPromptOptionsSchema.parse({
      embeddingsModel: embeddingsModel ?? models.embeddings,
      inferenceModel: inferenceModel ?? models.inference,
      maxTokens,
      prompt,
      systemPrompt,
      temperature,
      topP,
    });

    await handlePromptWithStreaming(interaction, options, 'chat query command');
  },
});
